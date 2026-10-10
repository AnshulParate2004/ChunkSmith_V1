import { getSupabaseAdmin } from "@/server/lib/supabase";
import { VectorStoreManager } from "@/server/lib/vector-store";
import { KeyPoolRotator } from "@/server/lib/key-pool";
import { ConversationManager } from "@/server/lib/chat-agent";
import { serverConfig } from "@/server/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const convManager = new ConversationManager();
const vectorManager = new VectorStoreManager();

async function determineAgentPlan(
  message: string,
  history: Array<{ role: string; content: string }>,
  keyPool: KeyPoolRotator
): Promise<{ useRag: boolean; ragQuery: string; intent: string }> {
  const trimmed = message.trim();

  // 1. Instant fast-path for trivial single-word greetings / gratitude (0ms latency optimization)
  if (
    /^(hi|hello|hey|heya|howdy|greetings|good\s+(morning|afternoon|evening|night)|thanks|thank\s+you|ok|okay|cool|nice|great)[\s!.?]*$/i.test(
      trimmed
    )
  ) {
    return { useRag: false, ragQuery: "", intent: "conversational" };
  }

  // 2. Instant fast-path for direct meta assistant questions
  if (
    /^(what tools|which tools|what can you do|who are you|introduce yourself|what are your capabilities)[\s?.!]*$/i.test(
      trimmed
    )
  ) {
    return { useRag: false, ragQuery: "", intent: "assistant_meta" };
  }

  // 3. True Agentic Tool-Calling: Let the LLM Agent decide whether to search and formulate its query
  const recentContext = history
    .slice(-4)
    .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
    .join("\n");

  const plannerPrompt = `You are the Autonomous Planning Agent for ChunkSmith, an intelligent multimodal document analysis system.
You have access to the following tool:
- document_search(query: string): Searches through indexed project documents for technical facts, scientific explanations, data, definitions, and diagrams.

Recent conversation context:
${recentContext || "(No prior conversation)"}

User message: "${trimmed}"

DECISION INSTRUCTIONS:
1. If the user message is casual conversation, greeting, polite chit-chat, or asking what tools you have, choose "direct_answer".
2. If the user is asking about any scientific, technical, or document concept, or asking follow-up questions referencing previous topics, choose "document_search".
3. When choosing "document_search", YOU MUST FORMULATE THE OPTIMAL SEARCH QUERY:
   - Fix all typos, misspellings, and phonetic slang (e.g. "hat i alveid" -> "what is alveoli", "mitocandria" -> "mitochondria").
   - Resolve pronouns ("it", "they", "its function") using the conversation context.
   - Strip conversational filler ("yeah explain me", "can you tell me", "please show").
   - Output a concise, canonical search query (2 to 6 keywords) ideal for vector search.

Respond ONLY with valid JSON in this exact structure:
{
  "action": "document_search" | "direct_answer",
  "query": "the search query you formulated (or empty string if direct_answer)",
  "intent": "document_search" | "conversational" | "assistant_meta"
}`;

  try {
    const rawPlan = await keyPool.chatCompletion(
      [
        { role: "system", content: "You are an accurate, fast JSON-only tool-calling planner agent." },
        { role: "user", content: plannerPrompt },
      ],
      { temperature: 0.1 }
    );

    const jsonMatch = rawPlan.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.action === "document_search" && parsed.query) {
        return {
          useRag: true,
          ragQuery: String(parsed.query).trim(),
          intent: "document_search",
        };
      } else if (parsed.action === "direct_answer") {
        return {
          useRag: false,
          ragQuery: "",
          intent: parsed.intent || "conversational",
        };
      }
    }
  } catch (err) {
    console.warn("Agent planner LLM error, falling back to heuristic query:", err);
  }

  // Fallback if planner LLM had an issue
  const fallbackCleaned =
    trimmed
      .replace(
        /^(can you\s+|could you\s+|please\s+|tell me\s+|kindly\s+|explain\s+me\s+|yeah\s+explain\s+me\s+)/i,
        ""
      )
      .trim() || trimmed;

  return { useRag: true, ragQuery: fallbackCleaned, intent: "document_search" };
}

export async function GET(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  const { conversationId } = params;
  const url = new URL(request.url);
  const message = url.searchParams.get("message") || "";

  const scoreThresholdParam = url.searchParams.get("scoreThreshold");
  const scoreThreshold =
    scoreThresholdParam !== null && !isNaN(parseFloat(scoreThresholdParam))
      ? parseFloat(scoreThresholdParam)
      : 0.60;

  const imageSelectionMode = (url.searchParams.get("imageSelectionMode") || "summary").toLowerCase();

  if (!message) {
    return new Response(JSON.stringify({ detail: "message query param is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getSupabaseAdmin();

  async function getCandidateImagesBase64(
    projId: string,
    candidates: Array<{ filename: string }>
  ): Promise<Array<{ mimeType: string; data: string }>> {
    const results: Array<{ mimeType: string; data: string }> = [];
    const candidateBuckets = [
      serverConfig.SUPABASE_BUCKET_NAME || "chunk_images",
      serverConfig.SUPABASE_DATA_BUCKET_NAME || "chunk_data",
    ];

    for (const c of candidates.slice(0, 2)) {
      const cleanFilename = decodeURIComponent(c.filename).split("?")[0];
      const candidatePaths = [
        `${projId}/images/${cleanFilename}`,
        `images/${cleanFilename}`,
        `${projId}/${cleanFilename}`,
        cleanFilename,
      ];
      let mimeType = "image/png";
      if (cleanFilename.toLowerCase().endsWith(".jpg") || cleanFilename.toLowerCase().endsWith(".jpeg")) {
        mimeType = "image/jpeg";
      } else if (cleanFilename.toLowerCase().endsWith(".webp")) {
        mimeType = "image/webp";
      }

      for (const bucket of candidateBuckets) {
        let found = false;
        for (const p of candidatePaths) {
          try {
            const { data, error } = await supabase.storage.from(bucket).download(p);
            if (data && !error) {
              const buf = Buffer.from(await data.arrayBuffer());
              results.push({ mimeType, data: buf.toString("base64") });
              found = true;
              break;
            }
          } catch {}
        }
        if (found) break;
      }
    }
    return results;
  }

  // Find conversation to get project_id
  let projectId = url.searchParams.get("projectId") || "";
  let conversation: any = null;

  try {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();
    if (data) {
      conversation = data;
      projectId = data.project_id;
    }
  } catch {}

  if (!projectId) {
    projectId = "NCERT";
  }

  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      function send(type: string, data: Record<string, any> = {}) {
        const payload = JSON.stringify({ type, ...data });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }

      try {
        // 1. Connected
        send("connected");

        // KeyPool for agent planning and streaming
        const keyPool = new KeyPoolRotator({
          geminiKeys: serverConfig.GEMINI_KEYS,
          groqKeys: serverConfig.GROQ_KEYS,
          geminiModels: serverConfig.GEMINI_MODELS,
          groqModels: serverConfig.GROQ_MODELS,
        });

        // Load conversation history for contextual agent reasoning
        let history: Array<{ role: string; content: string }> = [];
        try {
          const pastMsgs = await convManager.getMessages(conversationId);
          history = pastMsgs.slice(-6).map((m: any) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          }));
        } catch {}

        // 2. Agent Planning (LLM Agent decides whether to invoke search and writes query)
        const plan = await determineAgentPlan(message, history, keyPool);

        send("planner_plan", {
          use_rag: plan.useRag,
          use_web: false,
          rag_query: plan.ragQuery,
          web_query: "",
        });

        let searchResults: any[] = [];
        interface CandidateImage {
          filename: string;
          data: string;
          sourceIdx: number;
          description?: string;
        }
        const candidateImages: CandidateImage[] = [];

        // 3. Execute Document Search Tool if plan requires RAG
        if (plan.useRag) {
          send("search_start", { query: plan.ragQuery });

          try {
            searchResults = await vectorManager.search(projectId, plan.ragQuery, 6);
          } catch (e) {
            console.warn("Vector search error:", e);
          }

          // Fallback to searching processed chunks in Supabase storage if vector search is empty
          if (!searchResults || searchResults.length === 0) {
            try {
              const { data: files } = await supabase.storage
                .from(serverConfig.SUPABASE_DATA_BUCKET_NAME)
                .list(`${projectId}/json`);

              if (files && files.length > 0) {
                const words = plan.ragQuery.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
                const scoredChunks: Array<{ chunk: any; score: number }> = [];

                const filePromises = files.slice(0, 15).map((f) =>
                  supabase.storage
                    .from(serverConfig.SUPABASE_DATA_BUCKET_NAME)
                    .download(`${projectId}/json/${f.name}`)
                );
                const downloaded = await Promise.all(filePromises);

                for (const item of downloaded) {
                  if (!item.data) continue;
                  try {
                    const chunks = JSON.parse(await item.data.text());
                    for (const c of (Array.isArray(chunks) ? chunks : [])) {
                      const text = (
                        c.enhanced_content ||
                        c.page_content ||
                        c.original_text ||
                        c.metadata?.enhanced_content ||
                        ""
                      ).toLowerCase();

                      let score = 0;
                      for (const w of words) {
                        if (text.includes(w)) score++;
                      }
                      if (score > 0) {
                        scoredChunks.push({ chunk: c, score });
                      }
                    }
                  } catch {}
                }

                scoredChunks.sort((a, b) => b.score - a.score);
                searchResults = scoredChunks.slice(0, 6).map((s) => ({
                  score: s.score / 10,
                  page_content:
                    s.chunk.enhanced_content ||
                    s.chunk.page_content ||
                    s.chunk.original_text ||
                    "",
                  metadata: s.chunk.metadata || s.chunk,
                }));
              }
            } catch (fbErr) {
              console.warn("Supabase chunks fallback search error:", fbErr);
            }
          }

          // Filter out results below user scoreThreshold
          const relevantResults = searchResults.filter(
            (r) => (r.score !== undefined ? r.score >= scoreThreshold : true)
          );

          // Complete search step
          send("search_complete", {
            chunks_count: relevantResults.length,
            sources: relevantResults.map(
              (r) => r.metadata?.filename || r.metadata?.document_id || "Document"
            ),
          });

          // Collect candidate images from the retrieved relevant chunks
          relevantResults.forEach((r, idx) => {
            const meta = r.metadata || {};
            const paths: string[] = meta.image_paths || r.image_paths || [];
            const interpretation = meta.image_interpretation || "";

            paths.forEach((p: string) => {
              const fname = p.split("/").pop();
              if (fname && !candidateImages.some((ci) => ci.filename === fname)) {
                candidateImages.push({
                  filename: fname,
                  data: `/api/projects/${projectId}/images/${fname}`,
                  sourceIdx: idx + 1,
                  description: interpretation,
                });
              }
            });

            if (meta.images_base64 && Array.isArray(meta.images_base64)) {
              meta.images_base64.forEach((img: any) => {
                const fname = img.filename || "image.png";
                if (!candidateImages.some((ci) => ci.filename === fname)) {
                  candidateImages.push({
                    filename: fname,
                    data: img.data || `/api/projects/${projectId}/images/${fname}`,
                    sourceIdx: idx + 1,
                    description: img.description || interpretation,
                  });
                }
              });
            }
          });
        }

        // 4. Response Start
        send("response_start");

        // 5. Build prompt based on intent
        let systemPrompt = "";

        if (plan.intent === "assistant_meta") {
          systemPrompt = `You are ChunkSmith AI, an autonomous multimodal document analysis assistant.
When asked about your tools, capabilities, or what you can do:
Clearly explain your core capabilities:
1. **Document Vector Search**: High-dimensional semantic search in your indexed project documents using Qdrant.
2. **Multimodal Content Extraction & Analysis**: Reading, analyzing, and synthesizing text, complex data tables, and diagrams/figures extracted from your PDFs.
3. **Context-Grounded Reasoning**: Answering domain questions strictly grounded in your project documents with citations.
4. **Interactive Document Chat**: Conversational exploration and real-time streaming answers across all uploaded files.
Be concise, clear, and professional.`;
        } else if (plan.useRag && searchResults.length > 0) {
          const relevantResults = searchResults.filter(
            (r) => (r.score !== undefined ? r.score >= scoreThreshold : true)
          );

          if (relevantResults.length > 0) {
            const context = relevantResults
              .map((r, i) => {
                const meta = r.metadata || {};
                const sourceImages = candidateImages.filter((ci) => ci.sourceIdx === i + 1);
                let figSection = "";
                if (sourceImages.length > 0) {
                  figSection =
                    "\nCandidate Figures in this section:\n" +
                    sourceImages
                      .map(
                        (fig) =>
                          `- Figure ID: ${fig.filename}${
                            fig.description ? ` (Visual Description: ${fig.description})` : ""
                          }`
                      )
                      .join("\n");
                }
                const scorePct = r.score !== undefined ? ` [Match: ${Math.round(r.score * 100)}%]` : "";
                return `[Source ${i + 1}]${scorePct} (${meta.filename || "Document"}):\n${r.page_content}${figSection}`;
              })
              .join("\n\n---\n\n");

            let figurePromptInstructions = "";
            if (imageSelectionMode === "vision") {
              figurePromptInstructions = `

MULTIMODAL FIGURE VISION VERIFICATION INSTRUCTIONS:
- The actual visual images of candidate document figures have been provided directly to your vision system.
- Carefully inspect each diagram with your vision capabilities and determine if it genuinely illustrates the user's question.
- At the end of your response, on a new line, output:
  If one or more figures directly illustrate the answer: [DISPLAY_IMAGES: filename1.png, filename2.png]
  If no figures are relevant: [DISPLAY_IMAGES: none]`;
            } else if (imageSelectionMode === "summary") {
              figurePromptInstructions = `

MULTIMODAL FIGURE SELECTION INSTRUCTIONS:
- Candidate figures associated with the retrieved sources are listed with their Figure IDs and descriptions.
- Carefully evaluate whether any candidate figure is genuinely helpful, informative, and directly relevant to illustrating the answer to the user's question.
- Never select decorative images, logos, headers, or figures that are not directly relevant to what was asked.
- At the end of your response, on a new line, output:
  If one or more figures are directly relevant: [DISPLAY_IMAGES: filename1.png, filename2.png]
  If no figures are directly relevant or needed: [DISPLAY_IMAGES: none]`;
            }

            systemPrompt = `You are ChunkSmith AI, an intelligent multimodal document analysis assistant.
Answer the user's question accurately, concisely, and factually based on the document context below.${figurePromptInstructions}

Document Context:
${context}`;
          } else {
            systemPrompt = `You are ChunkSmith AI, an intelligent multimodal document analysis assistant.
No document sections matched the current relevance threshold (${Math.round(scoreThreshold * 100)}%).
Politely inform the user that no relevant content was found in their indexed documents with the current threshold filter, and suggest lowering the relevance threshold slider if they would like broader results. Answer helpfully if you have general knowledge regarding their question.
At the very end of your response, output:
[DISPLAY_IMAGES: none]`;
          }
        } else {
          systemPrompt = `You are ChunkSmith AI, a friendly and intelligent multimodal document analysis assistant.
Respond politely and concisely to user greetings and general conversation.
Let the user know that you are ready to answer questions about their uploaded project documents.`;
        }

        const messages = [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: message },
        ];

        // Load candidate image bytes if vision mode is active
        let visionImages: Array<{ mimeType: string; data: string }> = [];
        if (imageSelectionMode === "vision" && candidateImages.length > 0) {
          try {
            visionImages = await getCandidateImagesBase64(projectId, candidateImages);
          } catch (vErr) {
            console.warn("Failed to load candidate images for vision:", vErr);
          }
        }

        let fullAnswer = "";
        let streamBuffer = "";

        for await (const chunk of keyPool.streamChat(messages, { images: visionImages })) {
          fullAnswer += chunk;
          streamBuffer += chunk;

          // Check if streamBuffer has a tag start '['
          const bracketIdx = streamBuffer.indexOf("[");
          if (bracketIdx !== -1) {
            if (bracketIdx > 0) {
              const flush = streamBuffer.slice(0, bracketIdx);
              send("content", { content: flush });
              streamBuffer = streamBuffer.slice(bracketIdx);
            }
            const closeIdx = streamBuffer.indexOf("]");
            if (closeIdx !== -1) {
              const tagCandidate = streamBuffer.slice(0, closeIdx + 1);
              if (/\[DISPLAY_IMAGES:\s*[^\]]+\]/i.test(tagCandidate)) {
                // Discard tag from user stream
                streamBuffer = streamBuffer.slice(closeIdx + 1);
              } else {
                // Not an image tag, stream it
                send("content", { content: tagCandidate });
                streamBuffer = streamBuffer.slice(closeIdx + 1);
              }
            } else if (streamBuffer.length > 150) {
              // Bracket wasn't an image tag
              send("content", { content: streamBuffer });
              streamBuffer = "";
            }
          } else {
            send("content", { content: streamBuffer });
            streamBuffer = "";
          }
        }

        if (streamBuffer && !/\[DISPLAY_IMAGES:\s*[^\]]+\]/i.test(streamBuffer)) {
          send("content", { content: streamBuffer });
        }

        // Clean answer for saving & final display
        const cleanedAnswer = fullAnswer.replace(/\[DISPLAY_IMAGES:\s*[^\]]+\]/gi, "").trim();

        // Resolve approved figures based on imageSelectionMode
        const approvedImages: Array<{ filename: string; data: string }> = [];

        if (imageSelectionMode === "off") {
          // Off: never show figures
        } else if (imageSelectionMode === "always") {
          // Always: show candidate figures directly
          candidateImages.slice(0, 2).forEach((ci) => {
            approvedImages.push({ filename: ci.filename, data: ci.data });
          });
        } else {
          // "summary" or "vision": LLM decides
          const tagMatch = fullAnswer.match(/\[DISPLAY_IMAGES:\s*([^\]]+)\]/i);
          if (tagMatch && tagMatch[1]) {
            const tagVal = tagMatch[1].trim();
            if (!tagVal.toLowerCase().includes("none")) {
              const requestedFiles = tagVal
                .split(",")
                .map((f) => f.trim().toLowerCase())
                .filter(Boolean);

              for (const req of requestedFiles) {
                const found = candidateImages.find(
                  (ci) =>
                    ci.filename.toLowerCase() === req ||
                    ci.filename.toLowerCase().includes(req) ||
                    req.includes(ci.filename.toLowerCase())
                );
                if (found && !approvedImages.some((ai) => ai.filename === found.filename)) {
                  approvedImages.push({
                    filename: found.filename,
                    data: found.data,
                  });
                }
              }
            }
          }
        }

        // Emit images SSE events ONLY for LLM-approved images
        if (approvedImages.length > 0) {
          send("images_found", { count: approvedImages.length });
          approvedImages.forEach((img) => {
            send("image", { filename: img.filename, data: img.data });
          });
        } else {
          send("images_found", { count: 0 });
        }

        // 6. Persist messages in database
        try {
          await convManager.addMessage(conversationId, "user", message);
          await convManager.addMessage(conversationId, "assistant", cleanedAnswer, {
            image_filenames: approvedImages.map((i) => i.filename),
          });
        } catch (dbErr) {
          console.warn("Failed to persist chat messages to DB:", dbErr);
        }

        // 7. Complete and End
        send("complete", { answer: cleanedAnswer });
        send("end");
      } catch (err: any) {
        console.error("Chat streaming error:", err);
        send("error", { message: err?.message || "Chat stream failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform, no-store",
      Connection: "keep-alive",
    },
  });
}

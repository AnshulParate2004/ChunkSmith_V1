import { getSupabaseAdmin } from "@/server/lib/supabase";
import { VectorStoreManager } from "@/server/lib/vector-store";
import { KeyPoolRotator } from "@/server/lib/key-pool";
import { ConversationManager } from "@/server/lib/chat-agent";
import { serverConfig } from "@/server/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const convManager = new ConversationManager();
const vectorManager = new VectorStoreManager();

function determineAgentPlan(message: string): { useRag: boolean; ragQuery: string; intent: string } {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // Common greetings, gratitude, small talk, identity
  const conversationalRegex =
    /^(hi|hello|hey|heya|howdy|greetings|good\s+(morning|afternoon|evening|night|day)|how\s+are\s+you.*|who\s+are\s+you.*|what\s+can\s+you\s+do.*|what\s+is\s+your\s+name.*|what\s+are\s+you.*|thanks.*|thank\s+you.*|bye.*|goodbye.*|ok.*|okay.*|cool.*|nice.*|great.*)[\s!.?]*$/i;

  if (conversationalRegex.test(trimmed)) {
    return { useRag: false, ragQuery: "", intent: "conversational" };
  }

  // Short words without question intent
  const words = lower.split(/\s+/).filter(Boolean);
  if (
    words.length <= 2 &&
    !/(what|why|how|when|where|which|who|explain|tell|is|are|does|do|can|define|meaning|table|diagram|image|car|plant|tissue|cell|water|salt|acid|base|force)/i.test(
      lower
    )
  ) {
    return { useRag: false, ragQuery: "", intent: "conversational" };
  }

  // Otherwise, user is asking a domain/document question -> trigger Document Search Tool!
  const cleanedQuery =
    trimmed
      .replace(/^(can you\s+|could you\s+|please\s+|tell me\s+|kindly\s+)/i, "")
      .trim() || trimmed;

  return { useRag: true, ragQuery: cleanedQuery, intent: "document_search" };
}

export async function GET(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  const { conversationId } = params;
  const url = new URL(request.url);
  const message = url.searchParams.get("message") || "";

  if (!message) {
    return new Response(JSON.stringify({ detail: "message query param is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getSupabaseAdmin();

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

        // 2. Agent Planning (decide whether to invoke document search tool or answer directly)
        const plan = determineAgentPlan(message);

        send("planner_plan", {
          use_rag: plan.useRag,
          use_web: false,
          rag_query: plan.ragQuery,
          web_query: "",
        });

        let searchResults: any[] = [];
        const images: Array<{ filename: string; data: string }> = [];

        // 3. Execute Document Search Tool if plan requires RAG
        if (plan.useRag) {
          send("search_start", { query: plan.ragQuery });

          try {
            searchResults = await vectorManager.search(projectId, plan.ragQuery, 4);
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
                searchResults = scoredChunks.slice(0, 4).map((s) => ({
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

          // Filter out low confidence vector results (below 0.45 similarity score)
          const relevantResults = searchResults.filter((r) => r.score === undefined || r.score >= 0.45);

          // Complete search step
          send("search_complete", {
            chunks_count: relevantResults.length,
            sources: relevantResults.map(
              (r) => r.metadata?.filename || r.metadata?.document_id || "Document"
            ),
          });

          // Extract images ONLY from relevant results
          relevantResults.forEach((r) => {
            const meta = r.metadata || {};
            const paths: string[] = meta.image_paths || r.image_paths || [];
            paths.forEach((p: string) => {
              const fname = p.split("/").pop();
              if (fname && !images.some((i) => i.filename === fname) && images.length < 3) {
                images.push({
                  filename: fname,
                  data: `/api/projects/${projectId}/images/${fname}`,
                });
              }
            });

            if (meta.images_base64 && Array.isArray(meta.images_base64)) {
              meta.images_base64.forEach((img: any) => {
                const fname = img.filename || "image.png";
                if (!images.some((i) => i.filename === fname) && images.length < 3) {
                  images.push({
                    filename: fname,
                    data: img.data || `/api/projects/${projectId}/images/${fname}`,
                  });
                }
              });
            }
          });

          if (images.length > 0) {
            send("images_found", { count: images.length });
            images.forEach((img) => {
              send("image", { filename: img.filename, data: img.data });
            });
          }
        }

        // 4. Response Start
        send("response_start");

        // 5. Build prompt based on intent
        let systemPrompt = "";

        if (plan.useRag && searchResults.length > 0) {
          const context = searchResults
            .map((r, i) => `[Source ${i + 1}]:\n${r.page_content}`)
            .join("\n\n");

          systemPrompt = `You are ChunkSmith AI, an intelligent multimodal document analysis assistant.
Answer the user's question accurately based on the document context below.
Be concise, helpful, and clear. If the context does not contain the answer, answer politely based on general knowledge while noting it is not explicitly in the indexed context.

Document Context:
${context}`;
        } else {
          systemPrompt = `You are ChunkSmith AI, a friendly and intelligent multimodal document analysis assistant.
Respond politely and concisely to user greetings and general conversation.
Let the user know that you are ready to answer questions about their uploaded project documents.`;
        }

        // Get past messages for context
        let history: Array<{ role: string; content: string }> = [];
        try {
          const pastMsgs = await convManager.getMessages(conversationId);
          history = pastMsgs.slice(-6).map((m: any) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          }));
        } catch {}

        const messages = [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: message },
        ];

        const keyPool = new KeyPoolRotator({
          geminiKeys: serverConfig.GEMINI_KEYS,
          groqKeys: serverConfig.GROQ_KEYS,
          geminiModels: serverConfig.GEMINI_MODELS,
          groqModels: serverConfig.GROQ_MODELS,
        });

        let fullAnswer = "";

        for await (const chunk of keyPool.streamChat(messages)) {
          fullAnswer += chunk;
          send("content", { content: chunk });
        }

        // 6. Persist messages in database
        try {
          await convManager.addMessage(conversationId, "user", message);
          await convManager.addMessage(conversationId, "assistant", fullAnswer, {
            image_filenames: images.map((i) => i.filename),
          });
        } catch (dbErr) {
          console.warn("Failed to persist chat messages to DB:", dbErr);
        }

        // 7. Complete and End
        send("complete", { answer: fullAnswer });
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

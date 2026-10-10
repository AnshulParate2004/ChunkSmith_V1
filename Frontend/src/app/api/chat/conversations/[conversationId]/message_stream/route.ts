import { getSupabaseAdmin } from "@/server/lib/supabase";
import { VectorStoreManager } from "@/server/lib/vector-store";
import { KeyPoolRotator } from "@/server/lib/key-pool";
import { ConversationManager } from "@/server/lib/chat-agent";
import { serverConfig } from "@/server/config";

export const dynamic = "force-dynamic";

const convManager = new ConversationManager();
const vectorManager = new VectorStoreManager();

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

        // 2. Planning
        send("planner_plan", {
          use_rag: true,
          use_web: false,
          rag_query: message,
          web_query: message,
        });

        // 3. Search Start
        send("search_start", { query: message });

        // Retrieve RAG chunks from Vector Store with Supabase storage fallback
        let searchResults: any[] = [];
        try {
          searchResults = await vectorManager.search(projectId, message, 4);
        } catch (e) {
          console.warn("Vector search error:", e);
        }

        // If Vector Store has no points or failed, fallback to searching processed chunks in Supabase storage
        if (!searchResults || searchResults.length === 0) {
          try {
            const { data: files } = await supabase.storage
              .from(serverConfig.SUPABASE_DATA_BUCKET_NAME)
              .list(`${projectId}/json`);

            if (files && files.length > 0) {
              const words = message.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
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

        // 4. Search Complete
        send("search_complete", {
          chunks_count: searchResults.length,
          sources: searchResults.map(
            (r) => r.metadata?.filename || r.metadata?.document_id || "Document"
          ),
        });

        // 5. Check for Images in retrieved chunks
        const images: Array<{ filename: string; data: string }> = [];
        searchResults.forEach((r) => {
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

        // 6. Response Start
        send("response_start");

        // 7. Generate stream with Key Pool Rotator
        const context = searchResults
          .map((r, i) => `[Source ${i + 1}]:\n${r.page_content}`)
          .join("\n\n");

        const systemPrompt = `You are ChunkSmith AI, an intelligent document analysis assistant.
Answer questions accurately based on the provided document context when relevant.
Be helpful, concise, and professional.

Document Context:
${context || "No specific document context found."}`;

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

        // 8. Persist messages in database
        try {
          await convManager.addMessage(conversationId, "user", message);
          await convManager.addMessage(conversationId, "assistant", fullAnswer, {
            image_filenames: images.map((i) => i.filename),
          });
        } catch (dbErr) {
          console.warn("Failed to persist chat messages to DB:", dbErr);
        }

        // 9. Complete and End
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
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

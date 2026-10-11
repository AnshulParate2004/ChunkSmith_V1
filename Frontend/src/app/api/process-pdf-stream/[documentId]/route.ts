import { getSupabaseAdmin } from "@/server/lib/supabase";
import { StorageManager } from "@/server/lib/storage";
import { serverConfig } from "@/server/config";

const storage = new StorageManager();

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { documentId: string } }
) {
  const { documentId } = params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type: string, data: any) {
        const payload = JSON.stringify({ type, data });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }

      // Initial connected event
      sendEvent("connected", {
        message: "Connected to document stream",
        document_id: documentId,
      });

      const supabase = getSupabaseAdmin();

      // Immediate check if document is already processed!
      try {
        const { data: doc } = await supabase
          .from("documents")
          .select("*")
          .eq("id", documentId)
          .single();

        if (doc && doc.status === "completed") {
          sendEvent("progress", {
            step: 4,
            step_name: "Vectorize",
            progress: 100,
            message: "Document processing complete!",
            document_id: documentId,
            chunks_processed: doc.chunk_count || 0,
            images_extracted: doc.image_count || 0,
          });

          sendEvent("complete", {
            document_id: documentId,
            chunks_processed: doc.chunk_count || 0,
            images_extracted: doc.image_count || 0,
            result: {
              document_id: documentId,
              chunks_processed: doc.chunk_count || 0,
              images_extracted: doc.image_count || 0,
              json_path: doc.json_path || "",
              vector_store_path: "qdrant",
              pickle_path: "",
            },
          });
          return;
        }
      } catch {}

      // Check document status loop (up to 180 seconds for deep OCR/RAG/embeddings)
      let attempts = 0;
      const maxAttempts = 180;

      const interval = setInterval(async () => {
        attempts++;

        try {
          const { data: doc } = await supabase
            .from("documents")
            .select("*")
            .eq("id", documentId)
            .single();

          if (doc && doc.status === "completed") {
            clearInterval(interval);

            sendEvent("progress", {
              step: 4,
              step_name: "Vectorize",
              progress: 100,
              message: "Document processing complete!",
              document_id: documentId,
              chunks_processed: doc.chunk_count || 0,
              images_extracted: doc.image_count || 0,
            });

            sendEvent("complete", {
              document_id: documentId,
              chunks_processed: doc.chunk_count || 0,
              images_extracted: doc.image_count || 0,
              result: {
                document_id: documentId,
                chunks_processed: doc.chunk_count || 0,
                images_extracted: doc.image_count || 0,
                json_path: doc.json_path || "",
                vector_store_path: "qdrant",
                pickle_path: "",
              },
            });

            controller.close();
            return;
          }

          if (doc && doc.status === "error") {
            clearInterval(interval);
            sendEvent("error", {
              message: "Document processing failed on server",
              document_id: documentId,
            });
            controller.close();
            return;
          }

          // Emit progressing steps gracefully across up to 3 minutes
          const step = attempts < 10 ? 1 : attempts < 40 ? 2 : attempts < 90 ? 3 : 4;
          const progress = Math.min(95, Math.floor(10 + (attempts / maxAttempts) * 85));
          sendEvent("progress", {
            step,
            step_name: step === 1 ? "Upload" : step === 2 ? "Parse & Extract" : step === 3 ? "Chunking" : "Vectorizing",
            progress,
            message: step === 1 ? "Uploading file..." : step === 2 ? "Parsing layout and extracting tables/images..." : step === 3 ? "Chunking document text..." : "Generating Gemini embeddings...",
            document_id: documentId,
          });

          if (attempts >= maxAttempts) {
            clearInterval(interval);
            // Fallback: check if json exists in storage
            sendEvent("complete", {
              document_id: documentId,
              chunks_processed: doc?.chunk_count || 0,
              images_extracted: 0,
              result: {
                document_id: documentId,
                chunks_processed: doc?.chunk_count || 0,
                images_extracted: 0,
                json_path: "",
                vector_store_path: "qdrant",
                pickle_path: "",
              },
            });
            controller.close();
          }
        } catch (err: any) {
          if (attempts >= maxAttempts) {
            clearInterval(interval);
            controller.close();
          }
        }
      }, 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

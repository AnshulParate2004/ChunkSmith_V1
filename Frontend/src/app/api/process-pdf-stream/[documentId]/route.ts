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

      // Check document status loop (up to 15 seconds)
      let attempts = 0;
      const maxAttempts = 15;

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

          // Emit progressing steps
          const step = Math.min(3, Math.floor(attempts / 2) + 1);
          const progress = Math.min(90, attempts * 10);
          sendEvent("progress", {
            step,
            step_name: step === 1 ? "Upload" : step === 2 ? "Parse" : "AI Process",
            progress,
            message: `Processing document (${progress}%)...`,
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

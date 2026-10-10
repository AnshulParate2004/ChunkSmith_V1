import { getUserFromRequest } from "@/server/lib/supabase";
import { ChatAgent } from "@/server/lib/chat-agent";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ detail: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { projectId } = params;
  const url = new URL(request.url);
  const message = url.searchParams.get("message");

  if (!message) {
    return new Response(JSON.stringify({ detail: "Message query param is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const agent = new ChatAgent(projectId);

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "connected", message: "Connected to chat stream" })}\n\n`
          )
        );

        let fullAnswer = "";
        for await (const chunk of agent.streamResponse(message)) {
          fullAnswer += chunk;
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`
            )
          );
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "complete",
              answer: fullAnswer,
              image_references: [],
            })}\n\n`
          )
        );
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: err?.message || "Stream error" })}\n\n`
          )
        );
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

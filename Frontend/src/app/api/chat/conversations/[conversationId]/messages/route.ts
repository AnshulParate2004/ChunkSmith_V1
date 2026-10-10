import { NextResponse } from "next/server";
import { ConversationManager } from "@/server/lib/chat-agent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const convManager = new ConversationManager();

export async function GET(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const { conversationId } = params;
    const messages = await convManager.getMessages(conversationId);
    return NextResponse.json(
      {
        success: true,
        messages: Array.isArray(messages) ? messages : [],
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, detail: error?.message || "Failed to load messages" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}

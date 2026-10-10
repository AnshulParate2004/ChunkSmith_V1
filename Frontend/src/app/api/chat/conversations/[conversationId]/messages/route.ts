import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/lib/supabase";
import { ConversationManager } from "@/server/lib/chat-agent";

const convManager = new ConversationManager();

export async function GET(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const { conversationId } = params;
    const messages = await convManager.getMessages(conversationId);
    return NextResponse.json({
      success: true,
      messages: Array.isArray(messages) ? messages : [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, detail: error?.message || "Failed to load messages" },
      { status: 500 }
    );
  }
}

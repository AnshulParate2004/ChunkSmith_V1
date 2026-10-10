import { NextResponse } from "next/server";
import { getUserFromRequest, getSupabaseAdmin } from "@/server/lib/supabase";
import { ConversationManager } from "@/server/lib/chat-agent";

const convManager = new ConversationManager();

export async function GET(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const { conversationId } = params;
    const messages = await convManager.getMessages(conversationId);
    return NextResponse.json(messages);
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to load messages" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const { conversationId } = params;
    const body = await request.json();
    const { role = "user", content, metadata = {} } = body;

    if (!content) {
      return NextResponse.json({ detail: "content is required" }, { status: 400 });
    }

    const message = await convManager.addMessage(conversationId, role, content, metadata);
    return NextResponse.json(message);
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to add message" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const { conversationId } = params;
    const supabase = getSupabaseAdmin();
    await supabase.from("messages").delete().eq("conversation_id", conversationId);
    await supabase.from("conversations").delete().eq("id", conversationId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to delete conversation" }, { status: 500 });
  }
}

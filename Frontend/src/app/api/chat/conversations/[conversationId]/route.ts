import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/lib/supabase";
import { ConversationManager } from "@/server/lib/chat-agent";

const convManager = new ConversationManager();

export async function GET(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

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
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

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

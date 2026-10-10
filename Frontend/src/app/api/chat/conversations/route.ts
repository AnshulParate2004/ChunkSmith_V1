import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/lib/supabase";
import { ConversationManager } from "@/server/lib/chat-agent";

const convManager = new ConversationManager();

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id");
    if (!projectId) {
      return NextResponse.json({ detail: "project_id is required" }, { status: 400 });
    }

    const conversations = await convManager.listConversations(projectId, user?.id);
    return NextResponse.json(conversations);
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to list conversations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    const body = await request.json();
    const { project_id, title } = body;
    if (!project_id) {
      return NextResponse.json({ detail: "project_id is required" }, { status: 400 });
    }

    const userId = user?.id || "83bd61ed-2f87-4598-bc59-cdca6557bb5a";
    const conversation = await convManager.createConversation(project_id, userId, title);
    return NextResponse.json(conversation);
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to create conversation" }, { status: 500 });
  }
}

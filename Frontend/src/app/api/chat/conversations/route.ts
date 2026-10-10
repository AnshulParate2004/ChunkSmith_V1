import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/lib/supabase";
import { ConversationManager } from "@/server/lib/chat-agent";
import { KeyPoolRotator } from "@/server/lib/key-pool";
import { serverConfig } from "@/server/config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    return NextResponse.json(conversations, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to list conversations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    const body = await request.json();
    const { project_id, title, first_message } = body;
    if (!project_id) {
      return NextResponse.json({ detail: "project_id is required" }, { status: 400 });
    }

    let conversationTitle = title;
    const msg = (first_message || "").trim();

    if (!conversationTitle && msg) {
      try {
        const keyPool = new KeyPoolRotator({
          geminiKeys: serverConfig.GEMINI_KEYS,
          groqKeys: serverConfig.GROQ_KEYS,
          geminiModels: serverConfig.GEMINI_MODELS,
          groqModels: serverConfig.GROQ_MODELS,
        });
        const prompt = `Generate a concise, professional title (3 to 5 words maximum, no quotes, no trailing punctuation) summarizing this question for a chat sidebar:
User message: "${msg}"
Title:`;
        const generated = await keyPool.chatCompletion(
          [{ role: "user", content: prompt }],
          { maxTokens: 15, temperature: 0.2 }
        );
        if (generated && generated.trim().length > 0) {
          conversationTitle = generated.trim().replace(/^["']|["']$/g, "").replace(/\.+$/, "").slice(0, 45);
        }
      } catch (err) {
        console.warn("Failed to generate title with LLM:", err);
      }

      if (!conversationTitle) {
        const cleaned = msg
          .replace(/^(can you\s+|please\s+|tell me\s+|what is\s+|how to\s+|explain\s+me\s+|explain\s+)/i, "")
          .trim();
        conversationTitle = cleaned.slice(0, 35) || "New Chat";
      }
    }

    const userId = user?.id || "83bd61ed-2f87-4598-bc59-cdca6557bb5a";
    const conversation = await convManager.createConversation(project_id, userId, conversationTitle);
    return NextResponse.json(conversation);
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to create conversation" }, { status: 500 });
  }
}

import { getSupabaseAdmin } from "./supabase";
import { VectorStoreManager } from "./vector-store";
import { KeyPoolRotator } from "./key-pool";
import { serverConfig } from "../config";

export class ConversationManager {
  private supabase = getSupabaseAdmin();

  async listConversations(projectId: string, userId: string) {
    const { data, error } = await this.supabase
      .from("conversations")
      .select("id, title, created_at, updated_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error || !data) return [];
    return data;
  }

  async createConversation(projectId: string, userId: string, title?: string) {
    const defaultTitle = title || `Chat ${new Date().toLocaleDateString()}`;
    const { data, error } = await this.supabase
      .from("conversations")
      .insert({
        project_id: projectId,
        user_id: userId,
        title: defaultTitle,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create conversation: ${error.message}`);
    }
    return data;
  }

  async getMessages(conversationId: string) {
    const { data, error } = await this.supabase
      .from("messages")
      .select("id, role, content, metadata, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data;
  }

  async addMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string,
    metadata: Record<string, any> = {}
  ) {
    const { data, error } = await this.supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role,
        content,
        metadata,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save message: ${error.message}`);
    }

    // Touch conversation updated_at
    await this.supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return data;
  }
}

export class ChatAgent {
  private projectId: string;
  private vectorManager = new VectorStoreManager();
  private keyPool: KeyPoolRotator;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.keyPool = new KeyPoolRotator({
      geminiKeys: serverConfig.GEMINI_KEYS,
      groqKeys: serverConfig.GROQ_KEYS,
      geminiModels: serverConfig.GEMINI_MODELS,
      groqModels: serverConfig.GROQ_MODELS,
    });
  }

  async generateResponse(
    userMessage: string,
    history: Array<{ role: string; content: string }> = []
  ): Promise<{ answer: string; image_references: any[] }> {
    let context = "";
    try {
      const searchResults = await this.vectorManager.search(this.projectId, userMessage, 4);
      if (searchResults.length > 0) {
        context = searchResults.map((r, i) => `[Source ${i + 1}]:\n${r.page_content}`).join("\n\n");
      }
    } catch (e) {
      console.warn("RAG retrieval skipped or failed:", e);
    }

    const systemPrompt = `You are ChunkSmith AI, an intelligent multimodal document assistant.
Answer questions based on the retrieved document context below when available.
If the answer is in the context, be clear, accurate, and concise.

Context:
${context || "No specific document context found."}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: h.content,
      })),
      { role: "user", content: userMessage },
    ];

    const answer = await this.keyPool.chatCompletion(messages, { temperature: 0.2 });

    return {
      answer,
      image_references: [],
    };
  }

  async *streamResponse(
    userMessage: string,
    history: Array<{ role: string; content: string }> = []
  ): AsyncGenerator<string, void, unknown> {
    let context = "";
    try {
      const searchResults = await this.vectorManager.search(this.projectId, userMessage, 4);
      if (searchResults.length > 0) {
        context = searchResults.map((r, i) => `[Source ${i + 1}]:\n${r.page_content}`).join("\n\n");
      }
    } catch (e) {
      console.warn("RAG retrieval skipped or failed:", e);
    }

    const systemPrompt = `You are ChunkSmith AI, an intelligent multimodal document assistant.
Answer questions based on the retrieved document context below when available.

Context:
${context || "No specific document context found."}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: h.content,
      })),
      { role: "user", content: userMessage },
    ];

    for await (const chunk of this.keyPool.streamChat(messages)) {
      yield chunk;
    }
  }
}

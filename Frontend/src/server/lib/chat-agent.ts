import { getSupabaseAdmin } from "./supabase";
import { VectorStoreManager } from "./vector-store";
import { serverConfig } from "../config";
import OpenAI from "openai";
import { Portkey } from "portkey-ai";

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

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  private getClient(): { client: any; modelName: string } {
    // 1. Portkey Gateway (Multi-API key, load balancing & failover)
    if (serverConfig.PORTKEY_API_KEY) {
      const portkeyOptions: any = {
        apiKey: serverConfig.PORTKEY_API_KEY,
      };
      if (serverConfig.PORTKEY_CONFIG_ID) {
        portkeyOptions.config = serverConfig.PORTKEY_CONFIG_ID;
      }
      if (serverConfig.PORTKEY_VIRTUAL_KEY) {
        portkeyOptions.virtualKey = serverConfig.PORTKEY_VIRTUAL_KEY;
      }
      const portkey = new Portkey(portkeyOptions);
      return { client: portkey, modelName: serverConfig.AZURE_OPENAI_CHAT_MODEL || "gpt-4o" };
    }

    // 2. Azure OpenAI
    if (serverConfig.AZURE_OPENAI_API_KEY && serverConfig.AZURE_OPENAI_ENDPOINT) {
      const endpoint = serverConfig.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "");
      const azureClient = new OpenAI({
        apiKey: serverConfig.AZURE_OPENAI_API_KEY,
        baseURL: `${endpoint}/openai/deployments/${serverConfig.AZURE_OPENAI_CHAT_MODEL}`,
        defaultQuery: { "api-version": serverConfig.AZURE_OPENAI_API_VERSION },
        defaultHeaders: { "api-key": serverConfig.AZURE_OPENAI_API_KEY },
      });
      return { client: azureClient, modelName: serverConfig.AZURE_OPENAI_CHAT_MODEL };
    }

    // 3. Standard OpenAI
    const directClient = new OpenAI({
      apiKey: serverConfig.OPENAI_API_KEY || "dummy",
    });
    return { client: directClient, modelName: "gpt-4o" };
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

    const { client, modelName } = this.getClient();

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: h.content,
      })),
      { role: "user", content: userMessage },
    ];

    const response = await client.chat.completions.create({
      model: modelName,
      messages,
      temperature: 0.2,
    });

    const answer = response.choices[0]?.message?.content || "No response generated.";
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

    const { client, modelName } = this.getClient();

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map((h) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: h.content,
      })),
      { role: "user", content: userMessage },
    ];

    const stream = await client.chat.completions.create({
      model: modelName,
      messages,
      temperature: 0.2,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        yield content;
      }
    }
  }
}

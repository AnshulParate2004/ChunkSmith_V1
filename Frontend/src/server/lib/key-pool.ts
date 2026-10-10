import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

export interface KeyPoolConfig {
  geminiKeys: string[];
  groqKeys: string[];
  geminiModels?: string[];
  groqModels?: string[];
  geminiEmbeddingModel?: string;
}

export class KeyPoolRotator {
  private geminiKeys: string[] = [];
  private groqKeys: string[] = [];
  private geminiModels: string[] = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"];
  private groqModels: string[] = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
  private geminiEmbeddingModel: string;
  private geminiIndex = 0;
  private groqIndex = 0;

  constructor(config: KeyPoolConfig) {
    this.geminiKeys = config.geminiKeys.filter((k) => k && k.trim().length > 0);
    this.groqKeys = config.groqKeys.filter((k) => k && k.trim().length > 0);
    if (config.geminiModels && config.geminiModels.length > 0) {
      this.geminiModels = config.geminiModels;
    }
    if (config.groqModels && config.groqModels.length > 0) {
      this.groqModels = config.groqModels;
    }
    this.geminiEmbeddingModel = config.geminiEmbeddingModel || "text-embedding-004";
  }

  // Round-robin with retry across all Gemini keys for vector embeddings
  async getEmbedding(text: string, customModel?: string): Promise<number[]> {
    if (this.geminiKeys.length === 0) {
      throw new Error("[KeyPool] No Gemini API keys configured for embeddings.");
    }

    const modelToUse = customModel || this.geminiEmbeddingModel;
    const startIndex = this.geminiIndex;
    let attempts = 0;

    while (attempts < this.geminiKeys.length) {
      const keyIndex = (startIndex + attempts) % this.geminiKeys.length;
      const key = this.geminiKeys[keyIndex];

      try {
        const ai = new GoogleGenAI({ apiKey: key });
        const res = await ai.models.embedContent({
          model: modelToUse,
          contents: text,
        });

        if (res.embedding?.values) {
          this.geminiIndex = (keyIndex + 1) % this.geminiKeys.length;
          return res.embedding.values;
        }
      } catch (err: any) {
        console.warn(`[KeyPool] Gemini embedding key #${keyIndex + 1} (${modelToUse}) failed/limited: ${err?.message}. Rotating...`);
        attempts++;
      }
    }

    throw new Error("[KeyPool] All Gemini embedding keys exhausted or failed.");
  }

  // Chat completion with 2D fallback: across multiple keys AND multiple models
  async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");

    // 1. Try Gemini: loop through configured models and keys
    for (const model of this.geminiModels) {
      if (this.geminiKeys.length === 0) break;

      const startIndex = this.geminiIndex;
      let attempts = 0;

      while (attempts < this.geminiKeys.length) {
        const keyIndex = (startIndex + attempts) % this.geminiKeys.length;
        const key = this.geminiKeys[keyIndex];

        try {
          const ai = new GoogleGenAI({ apiKey: key });
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
          });

          if (response.text) {
            this.geminiIndex = (keyIndex + 1) % this.geminiKeys.length;
            return response.text;
          }
        } catch (err: any) {
          console.warn(`[KeyPool] Gemini key #${keyIndex + 1} on model '${model}' limited (${err?.message}). Trying next...`);
          attempts++;
        }
      }
    }

    // 2. Try Groq: loop through configured models and keys
    for (const model of this.groqModels) {
      if (this.groqKeys.length === 0) break;

      const startGroq = this.groqIndex;
      let groqAttempts = 0;

      while (groqAttempts < this.groqKeys.length) {
        const keyIndex = (startGroq + groqAttempts) % this.groqKeys.length;
        const key = this.groqKeys[keyIndex];

        try {
          const groq = new Groq({ apiKey: key });
          const completion = await groq.chat.completions.create({
            model,
            messages: messages as any,
            temperature: options.temperature || 0.2,
            max_tokens: options.maxTokens || 2048,
          });

          const content = completion.choices[0]?.message?.content;
          if (content) {
            this.groqIndex = (keyIndex + 1) % this.groqKeys.length;
            return content;
          }
        } catch (err: any) {
          console.warn(`[KeyPool] Groq key #${keyIndex + 1} on model '${model}' limited (${err?.message}). Trying next...`);
          groqAttempts++;
        }
      }
    }

    throw new Error("[KeyPool] All Gemini and Groq key pools and model fallbacks exhausted.");
  }

  // Streaming chat completion with 2D fallback (keys + models)
  async *streamChat(
    messages: Array<{ role: string; content: string }>
  ): AsyncGenerator<string, void, unknown> {
    const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");

    // 1. Try Groq streaming across models and keys
    for (const model of this.groqModels) {
      if (this.groqKeys.length === 0) break;

      const startGroq = this.groqIndex;
      let groqAttempts = 0;

      while (groqAttempts < this.groqKeys.length) {
        const keyIndex = (startGroq + groqAttempts) % this.groqKeys.length;
        const key = this.groqKeys[keyIndex];

        try {
          const groq = new Groq({ apiKey: key });
          const stream = await groq.chat.completions.create({
            model,
            messages: messages as any,
            stream: true,
            temperature: 0.2,
          });

          this.groqIndex = (keyIndex + 1) % this.groqKeys.length;
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || "";
            if (delta) yield delta;
          }
          return;
        } catch (err: any) {
          console.warn(`[KeyPool] Groq stream key #${keyIndex + 1} on model '${model}' failed: ${err?.message}. Rotating...`);
          groqAttempts++;
        }
      }
    }

    // 2. Try Gemini streaming across models and keys
    for (const model of this.geminiModels) {
      if (this.geminiKeys.length === 0) break;

      const startGemini = this.geminiIndex;
      let geminiAttempts = 0;

      while (geminiAttempts < this.geminiKeys.length) {
        const keyIndex = (startGemini + geminiAttempts) % this.geminiKeys.length;
        const key = this.geminiKeys[keyIndex];

        try {
          const ai = new GoogleGenAI({ apiKey: key });
          const responseStream = await ai.models.generateContentStream({
            model,
            contents: prompt,
          });

          this.geminiIndex = (keyIndex + 1) % this.geminiKeys.length;
          for await (const chunk of responseStream) {
            if (chunk.text) yield chunk.text;
          }
          return;
        } catch (err: any) {
          console.warn(`[KeyPool] Gemini stream key #${keyIndex + 1} on model '${model}' failed: ${err?.message}. Rotating...`);
          geminiAttempts++;
        }
      }
    }

    throw new Error("[KeyPool] All streaming keys and model fallbacks failed.");
  }
}

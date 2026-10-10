import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

export interface KeyPoolConfig {
  geminiKeys: string[];
  groqKeys: string[];
  geminiModel?: string;
  geminiEmbeddingModel?: string;
  groqModel?: string;
}

export class KeyPoolRotator {
  private geminiKeys: string[] = [];
  private groqKeys: string[] = [];
  private geminiModel: string;
  private geminiEmbeddingModel: string;
  private groqModel: string;
  private geminiIndex = 0;
  private groqIndex = 0;

  constructor(config: KeyPoolConfig) {
    this.geminiKeys = config.geminiKeys.filter((k) => k && k.trim().length > 0);
    this.groqKeys = config.groqKeys.filter((k) => k && k.trim().length > 0);
    this.geminiModel = config.geminiModel || "gemini-1.5-flash";
    this.geminiEmbeddingModel = config.geminiEmbeddingModel || "text-embedding-004";
    this.groqModel = config.groqModel || "llama-3.3-70b-versatile";
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
          // Success! Advance index for round-robin
          this.geminiIndex = (keyIndex + 1) % this.geminiKeys.length;
          return res.embedding.values;
        }
      } catch (err: any) {
        console.warn(`[KeyPool] Gemini key #${keyIndex + 1} (${modelToUse}) failed or rate limited (${err?.message}). Trying next key...`);
        attempts++;
      }
    }

    throw new Error("[KeyPool] All Gemini embedding keys exhausted or failed.");
  }

  // Chat completion with fallback: Gemini pool <-> Groq pool with configurable models
  async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number;
      maxTokens?: number;
      geminiModel?: string;
      groqModel?: string;
    } = {}
  ): Promise<string> {
    const selectedGeminiModel = options.geminiModel || this.geminiModel;
    const selectedGroqModel = options.groqModel || this.groqModel;

    // 1. Try Gemini Keys Pool
    if (this.geminiKeys.length > 0) {
      const startIndex = this.geminiIndex;
      let attempts = 0;

      while (attempts < this.geminiKeys.length) {
        const keyIndex = (startIndex + attempts) % this.geminiKeys.length;
        const key = this.geminiKeys[keyIndex];

        try {
          const ai = new GoogleGenAI({ apiKey: key });
          const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
          const response = await ai.models.generateContent({
            model: selectedGeminiModel,
            contents: prompt,
          });

          if (response.text) {
            this.geminiIndex = (keyIndex + 1) % this.geminiKeys.length;
            return response.text;
          }
        } catch (err: any) {
          console.warn(`[KeyPool] Gemini chat key #${keyIndex + 1} (${selectedGeminiModel}) hit error/rate limit: ${err?.message}. Rotating...`);
          attempts++;
        }
      }
    }

    // 2. Try Groq Keys Pool
    if (this.groqKeys.length > 0) {
      const startGroq = this.groqIndex;
      let groqAttempts = 0;

      while (groqAttempts < this.groqKeys.length) {
        const keyIndex = (startGroq + groqAttempts) % this.groqKeys.length;
        const key = this.groqKeys[keyIndex];

        try {
          const groq = new Groq({ apiKey: key });
          const completion = await groq.chat.completions.create({
            model: selectedGroqModel,
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
          console.warn(`[KeyPool] Groq key #${keyIndex + 1} (${selectedGroqModel}) hit error/rate limit: ${err?.message}. Rotating...`);
          groqAttempts++;
        }
      }
    }

    throw new Error("[KeyPool] All Gemini and Groq accounts in pool are currently exhausted or unavailable.");
  }

  // Streaming chat completion with configurable models
  async *streamChat(
    messages: Array<{ role: string; content: string }>,
    options: { geminiModel?: string; groqModel?: string } = {}
  ): AsyncGenerator<string, void, unknown> {
    const selectedGroqModel = options.groqModel || this.groqModel;
    const selectedGeminiModel = options.geminiModel || this.geminiModel;

    // 1. Try Groq Keys for streaming
    if (this.groqKeys.length > 0) {
      const startGroq = this.groqIndex;
      let groqAttempts = 0;

      while (groqAttempts < this.groqKeys.length) {
        const keyIndex = (startGroq + groqAttempts) % this.groqKeys.length;
        const key = this.groqKeys[keyIndex];

        try {
          const groq = new Groq({ apiKey: key });
          const stream = await groq.chat.completions.create({
            model: selectedGroqModel,
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
          console.warn(`[KeyPool] Groq stream key #${keyIndex + 1} (${selectedGroqModel}) failed: ${err?.message}. Rotating...`);
          groqAttempts++;
        }
      }
    }

    // 2. Try Gemini Keys for streaming
    if (this.geminiKeys.length > 0) {
      const startGemini = this.geminiIndex;
      let geminiAttempts = 0;

      while (geminiAttempts < this.geminiKeys.length) {
        const keyIndex = (startGemini + geminiAttempts) % this.geminiKeys.length;
        const key = this.geminiKeys[keyIndex];

        try {
          const ai = new GoogleGenAI({ apiKey: key });
          const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
          const responseStream = await ai.models.generateContentStream({
            model: selectedGeminiModel,
            contents: prompt,
          });

          this.geminiIndex = (keyIndex + 1) % this.geminiKeys.length;
          for await (const chunk of responseStream) {
            if (chunk.text) yield chunk.text;
          }
          return;
        } catch (err: any) {
          console.warn(`[KeyPool] Gemini stream key #${keyIndex + 1} (${selectedGeminiModel}) failed: ${err?.message}. Rotating...`);
          geminiAttempts++;
        }
      }
    }

    throw new Error("[KeyPool] All Gemini and Groq streaming accounts in pool failed.");
  }
}

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
  private geminiModels: string[] = ["gemini-2.5-flash", "gemini-3.5-flash"];
  private groqModels: string[] = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];
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

    const rawModel = customModel || this.geminiEmbeddingModel || "gemini-embedding-001";
    const modelToUse = rawModel === "text-embedding-004" ? "gemini-embedding-001" : rawModel;
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
          config: { outputDimensionality: 768 },
        });

        const values = res.embeddings?.[0]?.values || (res as any).embedding?.values;
        if (values && values.length > 0) {
          this.geminiIndex = (keyIndex + 1) % this.geminiKeys.length;
          return values;
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

  // Streaming chat completion with 2D fallback (keys + models) and multimodal vision support
  async *streamChat(
    messages: Array<{ role: string; content: string }>,
    options?: {
      images?: Array<{ mimeType: string; data: string }>;
    }
  ): AsyncGenerator<string, void, unknown> {
    const prompt = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    const hasImages = !!(options?.images && options.images.length > 0);

    // Multimodal parts for Gemini
    const geminiParts: any[] = [];
    if (hasImages && options?.images) {
      for (const img of options.images) {
        geminiParts.push({
          inlineData: {
            mimeType: img.mimeType || "image/png",
            data: img.data,
          },
        });
      }
    }
    geminiParts.push({ text: prompt });

    // If images are provided, prioritize Gemini vision models first
    if (hasImages) {
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
              contents: [{ role: "user", parts: geminiParts }],
            });

            this.geminiIndex = (keyIndex + 1) % this.geminiKeys.length;
            for await (const chunk of responseStream) {
              if (chunk.text) yield chunk.text;
            }
            return;
          } catch (err: any) {
            console.warn(`[KeyPool] Gemini vision stream key #${keyIndex + 1} on model '${model}' failed: ${err?.message}. Rotating...`);
            geminiAttempts++;
          }
        }
      }
    }

    // 1. Try Groq streaming across models and keys (text-only)
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

    // 2. Try Gemini streaming across models and keys (standard text/fallback)
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

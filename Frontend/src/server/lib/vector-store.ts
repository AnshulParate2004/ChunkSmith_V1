import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenAI } from "@google/genai";
import { serverConfig } from "../config";

export class VectorStoreManager {
  private client: QdrantClient;
  private genAI?: GoogleGenAI;

  constructor() {
    this.client = new QdrantClient({
      url: serverConfig.QDRANT_URL,
      apiKey: serverConfig.QDRANT_API_KEY,
      checkCompatibility: false,
    });

    if (serverConfig.GOOGLE_API_KEY) {
      this.genAI = new GoogleGenAI({ apiKey: serverConfig.GOOGLE_API_KEY });
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    if (this.genAI) {
      try {
        const response = await this.genAI.models.embedContent({
          model: serverConfig.GOOGLE_EMBEDDING_MODEL || "text-embedding-004",
          contents: text,
        });
        if (response.embedding?.values) {
          return response.embedding.values;
        }
      } catch (err) {
        console.warn("Failed Google embedding, falling back if Azure is available:", err);
      }
    }

    if (serverConfig.AZURE_OPENAI_API_KEY && serverConfig.AZURE_OPENAI_ENDPOINT) {
      const endpoint = serverConfig.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "");
      const url = `${endpoint}/openai/deployments/${serverConfig.AZURE_OPENAI_EMBEDDING_MODEL}/embeddings?api-version=${serverConfig.AZURE_OPENAI_API_VERSION}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": serverConfig.AZURE_OPENAI_API_KEY,
        },
        body: JSON.stringify({ input: text }),
      });
      if (res.ok) {
        const json = await res.json();
        return json.data[0].embedding;
      }
    }

    throw new Error("No embedding provider configured or available");
  }

  async ensureCollection(collectionName: string, vectorSize = 768) {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some((c) => c.name === collectionName);
      if (!exists) {
        await this.client.createCollection(collectionName, {
          vectors: {
            size: vectorSize,
            distance: "Cosine",
          },
        });
      }
    } catch (e) {
      console.error("Error creating/checking collection in Qdrant:", e);
    }
  }

  async addDocuments(
    collectionName: string,
    docs: Array<{ id?: string; pageContent: string; metadata: Record<string, any> }>
  ) {
    if (!docs.length) return;

    const firstVector = await this.getEmbedding(docs[0].pageContent);
    await this.ensureCollection(collectionName, firstVector.length);

    const points = [];
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      const vector = i === 0 ? firstVector : await this.getEmbedding(doc.pageContent);
      const pointId = doc.id || crypto.randomUUID();

      const sanitizedMetadata: Record<string, any> = {
        ...doc.metadata,
        project_id: collectionName,
        page_content: doc.pageContent,
      };

      for (const key of Object.keys(sanitizedMetadata)) {
        const val = sanitizedMetadata[key];
        if (typeof val === "object" && val !== null) {
          sanitizedMetadata[key] = JSON.stringify(val);
        }
      }

      points.push({
        id: pointId,
        vector,
        payload: sanitizedMetadata,
      });
    }

    // Batch upsert
    const batchSize = 50;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await this.client.upsert(collectionName, {
        wait: true,
        points: batch,
      });
    }
  }

  async search(collectionName: string, query: string, limit = 5) {
    const vector = await this.getEmbedding(query);
    const searchResults = await this.client.search(collectionName, {
      vector,
      limit,
      with_payload: true,
    });

    return searchResults.map((result) => ({
      id: result.id,
      score: result.score,
      page_content: (result.payload?.page_content as string) || "",
      metadata: result.payload || {},
    }));
  }
}

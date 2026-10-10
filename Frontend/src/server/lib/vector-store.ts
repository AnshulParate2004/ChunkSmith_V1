import { QdrantClient } from "@qdrant/js-client-rest";
import { serverConfig } from "../config";
import { KeyPoolRotator } from "./key-pool";

export class VectorStoreManager {
  private client: QdrantClient;
  private keyPool: KeyPoolRotator;

  constructor() {
    this.client = new QdrantClient({
      url: serverConfig.QDRANT_URL,
      apiKey: serverConfig.QDRANT_API_KEY,
      checkCompatibility: false,
    });

    this.keyPool = new KeyPoolRotator({
      geminiKeys: serverConfig.GEMINI_KEYS,
      groqKeys: serverConfig.GROQ_KEYS,
    });
  }

  async getEmbedding(text: string): Promise<number[]> {
    return this.keyPool.getEmbedding(text);
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

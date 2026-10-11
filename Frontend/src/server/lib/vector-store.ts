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
      geminiEmbeddingModel: serverConfig.GEMINI_EMBEDDING_MODEL,
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

    const points: any[] = [];
    // Process embeddings with concurrency 6 leveraging the multi-key pool
    const concurrency = 6;
    for (let i = 0; i < docs.length; i += concurrency) {
      const slice = docs.slice(i, i + concurrency);
      const vectors = await Promise.all(
        slice.map(async (doc, idx) => {
          const globalIdx = i + idx;
          if (globalIdx === 0) return firstVector;
          return this.getEmbedding(doc.pageContent);
        })
      );

      slice.forEach((doc, idx) => {
        const pointId = doc.id || crypto.randomUUID();
        const sanitizedMetadata: Record<string, any> = {
          ...doc.metadata,
          project_id: collectionName,
          page_content: doc.pageContent,
        };
        points.push({
          id: pointId,
          vector: vectors[idx],
          payload: sanitizedMetadata,
        });
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
    let points: any[] = [];

    if (typeof (this.client as any).query === "function") {
      const res = await (this.client as any).query(collectionName, {
        query: vector,
        limit,
        with_payload: true,
      });
      points = res?.points || [];
    } else if (typeof (this.client as any).search === "function") {
      const res = await (this.client as any).search(collectionName, {
        vector,
        limit,
        with_payload: true,
      });
      points = Array.isArray(res) ? res : res?.result || [];
    }

    return points.map((result: any) => ({
      id: result.id,
      score: result.score,
      page_content:
        (result.payload?.page_content as string) ||
        (result.payload?.enhanced_content as string) ||
        "",
      metadata: result.payload || {},
    }));
  }

  async deleteDocument(collectionName: string, documentId: string) {
    try {
      await this.client.delete(collectionName, {
        filter: {
          must: [
            {
              key: "document_id",
              match: {
                value: documentId,
              },
            },
          ],
        },
      });
    } catch (e: any) {
      console.warn(`Vector store delete note (${collectionName}/${documentId}):`, e?.message);
    }
  }
}

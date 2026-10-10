import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
if (!process.env.SUPABASE_URL) dotenv.config({ path: ".env" });

import { createClient } from "@supabase/supabase-js";
import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const QDRANT_URL = process.env.QDRANT_URL || "";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || "";

const rawGeminiKeys = (process.env.GEMINI_KEYS || process.env.GOOGLE_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

console.log("=== ChunkSmith Fast Qdrant Re-indexer ===");
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log(`Qdrant URL:   ${QDRANT_URL}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const qdrant = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
  checkCompatibility: false,
});

let healthyKeys: string[] = [];

async function filterHealthyKeys() {
  console.log(`Verifying ${rawGeminiKeys.length} Gemini API keys...`);
  const active: string[] = [];
  for (let i = 0; i < rawGeminiKeys.length; i++) {
    const k = rawGeminiKeys[i];
    try {
      const ai = new GoogleGenAI({ apiKey: k });
      const res = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: "test",
        config: { outputDimensionality: 768 },
      });
      if (res.embeddings?.[0]?.values) {
        active.push(k);
        console.log(`  Key #${i + 1}: Valid & active`);
      }
    } catch {
      console.warn(`  Key #${i + 1}: Suspended/invalid, excluding from pool`);
    }
  }
  healthyKeys = active;
  console.log(`Ready with ${healthyKeys.length} healthy Gemini keys for parallel rotation.`);
}

let keyCursor = 0;

async function getEmbedding(text: string, retries = 3): Promise<number[]> {
  const clean = text.trim().slice(0, 8000) || "empty content";
  for (let attempt = 0; attempt < retries; attempt++) {
    const k = healthyKeys[keyCursor % healthyKeys.length];
    keyCursor++;
    try {
      const ai = new GoogleGenAI({ apiKey: k });
      const res = await ai.models.embedContent({
        model: "gemini-embedding-001",
        contents: clean,
        config: { outputDimensionality: 768 },
      });
      const vals = res.embeddings?.[0]?.values;
      if (vals && vals.length > 0) return vals;
    } catch (e: any) {
      if (attempt === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error("Embedding failed");
}

async function ensureCollection(collectionName: string) {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === collectionName);
  if (!exists) {
    console.log(`Creating collection '${collectionName}' in Qdrant (dim: 768, Cosine)...`);
    await qdrant.createCollection(collectionName, {
      vectors: { size: 768, distance: "Cosine" },
    });
  } else {
    console.log(`Collection '${collectionName}' verified in Qdrant.`);
  }
}

async function reindexProject(projectId: string) {
  console.log(`\n========================================`);
  console.log(`Processing project: ${projectId}`);
  console.log(`========================================`);

  await ensureCollection(projectId);

  const { data: files } = await supabase.storage
    .from("chunk_data")
    .list(`${projectId}/json`, { limit: 100 });

  const jsonFiles = (files || []).filter((f) => f.name.endsWith(".json"));
  console.log(`Found ${jsonFiles.length} JSON chunk files for project ${projectId}.`);

  let totalChunks = 0;
  let totalIndexed = 0;

  for (const file of jsonFiles) {
    const filePath = `${projectId}/json/${file.name}`;
    const { data: fileData } = await supabase.storage.from("chunk_data").download(filePath);
    if (!fileData) continue;

    const rawChunks = JSON.parse(await fileData.text());
    if (!Array.isArray(rawChunks) || rawChunks.length === 0) continue;

    totalChunks += rawChunks.length;
    console.log(`Indexing ${file.name} (${rawChunks.length} chunks)...`);

    const points: any[] = [];
    const docId = file.name.replace("_processed.json", "").replace(".json", "");

    // Process concurrently in chunks of healthyKeys.length
    const CONCURRENCY = Math.max(1, healthyKeys.length * 2);

    for (let i = 0; i < rawChunks.length; i += CONCURRENCY) {
      const slice = rawChunks.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        slice.map(async (c, subIdx) => {
          const globalIdx = i + subIdx;
          const meta = c.metadata || {};
          const text =
            c.enhanced_content || c.page_content || meta.enhanced_content || c.text || "";
          const orig = c.original_text || meta.original_text || text;

          let rawTables: string[] = meta.raw_tables_html || c.raw_tables_html || [];
          if (!rawTables.length && (text.includes("<table") || orig.includes("<table"))) {
            const tableMatches = (text + "\n" + orig).match(/<table[\s\S]*?<\/table>/gi);
            if (tableMatches) rawTables = [...new Set(tableMatches)];
          }

          const imagePaths: string[] = meta.image_paths || c.image_paths || [];
          const contentTypes: string[] = [...(meta.content_types || c.content_types || [])];
          if (!contentTypes.includes("text")) contentTypes.unshift("text");
          if (imagePaths.length > 0 && !contentTypes.includes("image")) contentTypes.push("image");
          if (rawTables.length > 0 && !contentTypes.includes("table")) contentTypes.push("table");

          const tableInterp = Array.isArray(c.table_interpretation || meta.table_interpretation)
            ? (c.table_interpretation || meta.table_interpretation).filter(Boolean).join("\n\n")
            : String(c.table_interpretation || meta.table_interpretation || "");

          const imageInterp = Array.isArray(c.image_interpretation || meta.image_interpretation)
            ? (c.image_interpretation || meta.image_interpretation).filter(Boolean).join("\n\n")
            : String(c.image_interpretation || meta.image_interpretation || "");

          const pointId = crypto.randomUUID();
          const vector = await getEmbedding(text || orig || "content");

          return {
            id: pointId,
            vector,
            payload: {
              project_id: projectId,
              document_id: docId,
              filename: meta.filename || `${docId}.pdf`,
              chunk_index: meta.chunk_index ?? c.chunk_index ?? globalIdx,
              page_content: text,
              enhanced_content: text,
              original_text: orig,
              raw_tables_html: rawTables,
              table_interpretation: tableInterp,
              image_interpretation: imageInterp,
              image_paths: imagePaths,
              content_types: contentTypes,
              page_numbers:
                meta.page_numbers || c.page_numbers || (meta.page_number ? [meta.page_number] : [1]),
              ai_summary: c.ai_summary || meta.ai_summary || "",
              ai_questions: c.ai_questions || meta.ai_questions || "",
            },
          };
        })
      );

      points.push(...batchResults);
    }

    // Upsert to Qdrant
    const batchSize = 100;
    for (let b = 0; b < points.length; b += batchSize) {
      const batch = points.slice(b, b + batchSize);
      await qdrant.upsert(projectId, { wait: true, points: batch });
    }

    totalIndexed += points.length;
    console.log(`  ✓ Uploaded ${file.name} (${points.length} points). Total: ${totalIndexed}/${totalChunks}`);
  }

  console.log(`Finished ${projectId}: ${totalIndexed} points indexed in Qdrant.`);
}

async function main() {
  await filterHealthyKeys();

  const activeProjects = ["NCERT", "LLM"];
  for (const p of activeProjects) {
    await reindexProject(p);
  }

  console.log("\n========================================");
  console.log("Qdrant Verification Summary:");
  console.log("========================================");

  for (const p of activeProjects) {
    const info = await qdrant.getCollection(p);
    console.log(`Collection '${p}': ${info.points_count} points stored.`);
  }

  // Verification vector search
  console.log("\nRunning test search on 'NCERT' for: 'water level change salt sugar'...");
  const ai = new GoogleGenAI({ apiKey: healthyKeys[0] });
  const embedRes = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: "water level change salt sugar",
    config: { outputDimensionality: 768 },
  });

  const queryVector = embedRes.embeddings?.[0]?.values;
  if (queryVector) {
    const searchRes = await qdrant.search("NCERT", {
      vector: queryVector,
      limit: 2,
      with_payload: true,
    });
    console.log("Top Result 1:");
    console.log("- Document ID:", searchRes[0]?.payload?.document_id);
    console.log("- Score:", searchRes[0]?.score);
    console.log("- Image Paths:", searchRes[0]?.payload?.image_paths);
    console.log("- Content Snippet:", (searchRes[0]?.payload?.page_content as string)?.slice(0, 140));
  }

  console.log("\nSUCCESS! New Qdrant database fully populated with embeddings from Supabase chunks!");
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});

import { NextResponse } from "next/server";
import { getUserFromRequest, getSupabaseAdmin } from "@/server/lib/supabase";
import { DocumentParser } from "@/server/lib/document-parser";
import { StorageManager } from "@/server/lib/storage";
import { VectorStoreManager } from "@/server/lib/vector-store";
import { serverConfig } from "@/server/config";

const parser = new DocumentParser();
const storage = new StorageManager();
const vectorManager = new VectorStoreManager();

export const maxDuration = 60; // Allow 60 seconds on Vercel Pro/serverless

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawProjectId =
      (formData.get("project_id") as string | null) ||
      url.searchParams.get("project_id");
    const projectId = rawProjectId ? decodeURIComponent(rawProjectId) : null;

    if (!file || !projectId) {
      return NextResponse.json({ detail: "file and project_id are required" }, { status: 400 });
    }

    const documentId = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sizeMb = Number((buffer.length / (1024 * 1024)).toFixed(2));

    const supabase = getSupabaseAdmin();

    // 1. Insert record into Supabase PostgreSQL documents table
    const { error: insertError } = await supabase.from("documents").insert({
      id: documentId,
      project_id: projectId,
      filename: file.name,
      status: "processing",
      size_mb: sizeMb,
      chunk_count: 0,
      image_count: 0,
    });
    if (insertError) {
      console.warn("Supabase document insert note:", insertError.message || insertError);
    }

    // 2. Upload original PDF to Supabase Storage
    const pdfPath = `${projectId}/uploads/${documentId}.pdf`;
    await storage.uploadBuffer(buffer, pdfPath, "application/pdf", serverConfig.SUPABASE_PDF_BUCKET_NAME);

    // 3. Parse Document via Unstructured API
    const maxCharacters = Number(
      formData.get("max_characters") ||
      url.searchParams.get("max_characters") ||
      serverConfig.MAX_CHARACTERS
    );
    const newAfterNChars = Number(
      formData.get("new_after_n_chars") ||
      url.searchParams.get("new_after_n_chars") ||
      serverConfig.NEW_AFTER_N_CHARS
    );
    const combineTextUnderNChars = Number(
      formData.get("combine_text_under_n_chars") ||
      url.searchParams.get("combine_text_under_n_chars") ||
      serverConfig.COMBINE_TEXT_UNDER_N_CHARS
    );
    const rawLanguages = (formData.get("languages") || url.searchParams.get("languages")) as string | null;
    const languages = rawLanguages ? [rawLanguages] : ["english"];

    const elements = await parser.parseDocument(buffer, file.name, {
      maxCharacters,
      newAfterNChars,
      combineTextUnderNChars,
      languages,
    });

    // 4. Transform to chunks
    const chunks = elements.map((elem, idx) => ({
      chunk_id: `${documentId}_${idx}`,
      document_id: documentId,
      text: elem.text,
      metadata: {
        ...elem.metadata,
        document_id: documentId,
        project_id: projectId,
        type: elem.type,
      },
    }));

    // 5. Store processed JSON in Supabase Storage
    const jsonBuffer = Buffer.from(JSON.stringify(chunks, null, 2), "utf-8");
    const jsonPath = `${projectId}/json/${documentId}_processed.json`;
    await storage.uploadBuffer(jsonBuffer, jsonPath, "application/json", serverConfig.SUPABASE_DATA_BUCKET_NAME);

    // 6. Index into Qdrant Vector Store
    if (chunks.length > 0) {
      await vectorManager.addDocuments(
        projectId,
        chunks.map((c) => ({
          id: crypto.randomUUID(),
          pageContent: c.text,
          metadata: c.metadata,
        }))
      );
    }

    // 7. Update status to completed
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        status: "completed",
        chunk_count: chunks.length,
        pdf_path: pdfPath,
        json_path: jsonPath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (updateError) {
      console.warn("Supabase document update note:", updateError.message || updateError);
    }

    return NextResponse.json({
      success: true,
      document_id: documentId,
      chunks_count: chunks.length,
      message: "Document processed and indexed successfully",
    });
  } catch (error: any) {
    console.error("PDF processing error:", error);
    return NextResponse.json({ detail: error?.message || "Document processing failed" }, { status: 500 });
  }
}

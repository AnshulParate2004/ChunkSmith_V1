import { NextResponse } from "next/server";
import { getUserFromRequest, getSupabaseAdmin } from "@/server/lib/supabase";
import { DocumentParser } from "@/server/lib/document-parser";
import { StorageManager } from "@/server/lib/storage";
import { VectorStoreManager } from "@/server/lib/vector-store";
import { extractImagesFromPdf, attachImagesToChunks } from "@/server/lib/pdf-image-extractor";
import { serverConfig } from "@/server/config";

const parser = new DocumentParser();
const storage = new StorageManager();
const vectorManager = new VectorStoreManager();

export const maxDuration = 300; // Allow up to 5 minutes for deep parsing, OCR, and vector embeddings

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

    const rawDocId = (formData.get("document_id") as string | null) || url.searchParams.get("document_id");
    const documentId = rawDocId ? rawDocId.trim() : `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
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

    // 4. Transform to chunks & preserve image data
    let totalImages = 0;
    const chunks = elements.map((elem, idx) => {
      const meta = elem.metadata || {};
      const imgB64 = meta.image_base64 || (elem as any).image_base64 || null;
      const imgPaths = meta.image_paths || (elem as any).image_paths || [];
      const rawBase64 = imgB64 ? (Array.isArray(imgB64) ? imgB64 : [imgB64]) : [];

      if (rawBase64.length > 0 || imgPaths.length > 0) {
        totalImages += Math.max(rawBase64.length, imgPaths.length);
      }

      return {
        chunk_id: `${documentId}_${idx}`,
        document_id: documentId,
        text: elem.text,
        image_paths: imgPaths,
        image_base64: rawBase64,
        metadata: {
          ...meta,
          document_id: documentId,
          project_id: projectId,
          type: elem.type,
          image_paths: imgPaths,
          image_base64: rawBase64,
        },
      };
    });

    // 4b. Extract embedded PDF figures/images if parser did not extract them
    if (totalImages === 0 && chunks.length > 0) {
      const extractedImages = extractImagesFromPdf(buffer);
      if (extractedImages.length > 0) {
        const uploadedImages = [];
        for (let i = 0; i < extractedImages.length; i++) {
          const img = extractedImages[i];
          const imgStoragePath = `${projectId}/images/${documentId}_img_${i + 1}.jpg`;
          try {
            await storage.uploadBuffer(
              img.buffer,
              imgStoragePath,
              img.mimeType,
              serverConfig.SUPABASE_DATA_BUCKET_NAME
            );
            const publicUrl = storage.getPublicUrl(imgStoragePath, serverConfig.SUPABASE_DATA_BUCKET_NAME);
            uploadedImages.push({
              name: img.name,
              publicUrl: publicUrl || imgStoragePath,
              base64: img.base64,
              index: i,
            });
          } catch (err) {
            uploadedImages.push({
              name: img.name,
              publicUrl: "",
              base64: img.base64,
              index: i,
            });
          }
        }

        attachImagesToChunks(chunks, uploadedImages);
        totalImages = uploadedImages.length;
      }
    }

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

    // 7. Update status to completed with accurate image_count
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        status: "completed",
        chunk_count: chunks.length,
        image_count: totalImages,
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

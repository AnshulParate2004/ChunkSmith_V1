import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/lib/supabase";
import { StorageManager } from "@/server/lib/storage";
import { serverConfig } from "@/server/config";

const storage = new StorageManager();

export async function GET(
  request: Request,
  { params }: { params: { projectId: string; documentId: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    // Allow public/project document chunk reading even if guest session
    const { projectId, documentId } = params;

    const cleanId = documentId.replace(/\.pdf$/i, "");
    const pdfId = documentId.endsWith(".pdf") ? documentId : `${documentId}.pdf`;

    let jsonBuffer: Buffer | null = null;
    const candidatePaths = [
      `${projectId}/json/${documentId}_processed.json`,
      `${projectId}/json/${cleanId}_processed.json`,
      `${projectId}/json/${pdfId}_processed.json`,
      `${projectId}/json/${documentId}.json`,
      `${projectId}/json/${cleanId}.json`,
      `json/${documentId}_processed.json`,
      `json/${cleanId}_processed.json`,
      `json/${documentId}.json`,
      `${projectId}/${documentId}.json`,
    ];

    for (const p of candidatePaths) {
      try {
        jsonBuffer = await storage.downloadBuffer(p, serverConfig.SUPABASE_DATA_BUCKET_NAME);
        if (jsonBuffer) break;
      } catch {}
    }

    if (!jsonBuffer) {
      return NextResponse.json(
        {
          success: false,
          detail: `Chunks not found for document ${documentId}`,
          chunks_count: 0,
          chunks: [],
        },
        { status: 404 }
      );
    }

    const rawChunks = JSON.parse(jsonBuffer.toString("utf-8"));
    const chunks = Array.isArray(rawChunks)
      ? rawChunks.map((c: any, idx: number) => {
          const meta = c.metadata || {};
          const text =
            c.enhanced_content || c.page_content || meta.enhanced_content || c.text || "";
          const orig = c.original_text || meta.original_text || text;

          // 1. Raw HTML tables
          let rawTables: string[] = meta.raw_tables_html || c.raw_tables_html || [];
          if (!rawTables.length && (text.includes("<table") || orig.includes("<table"))) {
            const tableMatches = (text + "\n" + orig).match(/<table[\s\S]*?<\/table>/gi);
            if (tableMatches) {
              rawTables = [...new Set(tableMatches)];
            }
          }

          // 2. Images handling (both URLs and base64 strings)
          const imagePaths: string[] = meta.image_paths || c.image_paths || [];
          const rawBase64: any[] = meta.image_base64 || c.image_base64 || [];

          const imagesBase64 = imagePaths.map((p: string, i: number) => {
            const filename = p.split("/").pop() || `image_${i + 1}.png`;
            let base64Data = p;
            if (rawBase64[i]) {
              const item = rawBase64[i];
              if (typeof item === "string") {
                base64Data = item.startsWith("data:") ? item : `data:image/png;base64,${item}`;
              } else if (item.data) {
                base64Data = item.data.startsWith("data:") ? item.data : `data:image/png;base64,${item.data}`;
              }
            }
            return {
              filename,
              data: base64Data,
              path: p,
            };
          });

          if (imagesBase64.length === 0 && rawBase64.length > 0) {
            rawBase64.forEach((b64: any, i: number) => {
              const dataStr = typeof b64 === "string" ? b64 : b64.data || "";
              const fullData = dataStr.startsWith("data:") ? dataStr : `data:image/png;base64,${dataStr}`;
              imagesBase64.push({
                filename: `image_${i + 1}.png`,
                data: fullData,
                path: "",
              });
            });
          }

          // 3. Normalize content types
          let contentTypes: string[] = [...(meta.content_types || c.content_types || [])];
          if (!contentTypes.includes("text")) {
            contentTypes.unshift("text");
          }
          if ((imagesBase64.length > 0 || imagePaths.length > 0) && !contentTypes.includes("image")) {
            contentTypes.push("image");
          }
          if (rawTables.length > 0 && !contentTypes.includes("table")) {
            contentTypes.push("table");
          }

          // 4. Normalize interpretations (arrays to strings)
          const rawTableInterp = c.table_interpretation || meta.table_interpretation || "";
          const tableInterpretation = Array.isArray(rawTableInterp)
            ? rawTableInterp.filter(Boolean).join("\n\n")
            : String(rawTableInterp || "");

          const rawImageInterp = c.image_interpretation || meta.image_interpretation || "";
          const imageInterpretation = Array.isArray(rawImageInterp)
            ? rawImageInterp.filter(Boolean).join("\n\n")
            : String(rawImageInterp || "");

          return {
            chunk_index: meta.chunk_index ?? c.chunk_index ?? idx,
            enhanced_content: text,
            original_text: orig,
            raw_tables_html: rawTables,
            ai_questions: c.ai_questions || meta.ai_questions || "",
            ai_summary: c.ai_summary || meta.ai_summary || "",
            image_interpretation: imageInterpretation,
            table_interpretation: tableInterpretation,
            image_paths: imagePaths,
            page_numbers:
              meta.page_numbers || c.page_numbers || (meta.page_number ? [meta.page_number] : [1]),
            content_types: contentTypes,
            images_base64: imagesBase64,
          };
        })
      : [];

    return NextResponse.json({
      success: true,
      document_id: documentId,
      file_path: `${projectId}/uploads/${documentId}.pdf`,
      file_size_kb: Math.round(jsonBuffer.length / 1024),
      chunks_count: chunks.length,
      images_included: chunks.some((c: any) => c.images_base64?.length > 0),
      chunks: chunks,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, detail: error?.message || "Failed to fetch document chunks" },
      { status: 500 }
    );
  }
}

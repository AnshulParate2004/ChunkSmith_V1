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

    let jsonBuffer: Buffer | null = null;
    const candidatePaths = [
      `${projectId}/json/${documentId}_processed.json`,
      `${projectId}/json/${documentId}.json`,
      `json/${documentId}_processed.json`,
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
          const text = c.enhanced_content || c.original_text || c.text || "";
          const type = (c.metadata?.type || "text").toLowerCase();
          return {
            chunk_index: c.chunk_index ?? idx,
            enhanced_content: text,
            original_text: c.original_text || text,
            raw_tables_html: c.raw_tables_html || (type.includes("table") ? [text] : []),
            ai_questions: c.ai_questions || "",
            ai_summary: c.ai_summary || "",
            image_interpretation: c.image_interpretation || "",
            table_interpretation: c.table_interpretation || "",
            image_paths: c.image_paths || [],
            page_numbers: c.page_numbers || (c.metadata?.page_number ? [c.metadata.page_number] : [1]),
            content_types: c.content_types || [type],
          };
        })
      : [];

    return NextResponse.json({
      success: true,
      document_id: documentId,
      file_path: `${projectId}/uploads/${documentId}.pdf`,
      file_size_kb: Math.round(jsonBuffer.length / 1024),
      chunks_count: chunks.length,
      images_included: false,
      chunks: chunks,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, detail: error?.message || "Failed to fetch document chunks" },
      { status: 500 }
    );
  }
}

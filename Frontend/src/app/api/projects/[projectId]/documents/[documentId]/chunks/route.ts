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
    if (!user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const { projectId, documentId } = params;

    let jsonBuffer: Buffer;
    try {
      jsonBuffer = await storage.downloadBuffer(
        `${projectId}/json/${documentId}_processed.json`,
        serverConfig.SUPABASE_DATA_BUCKET_NAME
      );
    } catch {
      try {
        jsonBuffer = await storage.downloadBuffer(
          `json/${documentId}_processed.json`,
          serverConfig.SUPABASE_DATA_BUCKET_NAME
        );
      } catch (err: any) {
        return NextResponse.json(
          { success: false, detail: "Chunks not found yet" },
          { status: 404 }
        );
      }
    }

    const chunks = JSON.parse(jsonBuffer.toString("utf-8"));

    return NextResponse.json({
      success: true,
      document_id: documentId,
      chunks_count: Array.isArray(chunks) ? chunks.length : 0,
      chunks: Array.isArray(chunks) ? chunks : [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, detail: error?.message || "Failed to fetch document chunks" },
      { status: 500 }
    );
  }
}

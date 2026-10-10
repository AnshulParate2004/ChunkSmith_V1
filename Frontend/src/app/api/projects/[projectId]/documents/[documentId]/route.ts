import { NextResponse } from "next/server";
import { getUserFromRequest, getSupabaseAdmin } from "@/server/lib/supabase";
import { StorageManager } from "@/server/lib/storage";
import { VectorStoreManager } from "@/server/lib/vector-store";
import { serverConfig } from "@/server/config";

const storage = new StorageManager();
const vectorManager = new VectorStoreManager();

export async function DELETE(
  request: Request,
  { params }: { params: { projectId: string; documentId: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const { projectId, documentId } = params;
    const supabase = getSupabaseAdmin();

    // 1. Delete from database
    await supabase.from("documents").delete().eq("id", documentId).eq("project_id", projectId);

    // 2. Delete files from storage
    try {
      await storage.deleteFile(`${projectId}/uploads/${documentId}.pdf`, serverConfig.SUPABASE_PDF_BUCKET_NAME);
    } catch {}
    try {
      await storage.deleteFile(`${projectId}/json/${documentId}_processed.json`, serverConfig.SUPABASE_DATA_BUCKET_NAME);
    } catch {}

    // 3. Delete from vector store
    try {
      await vectorManager.deleteDocument(projectId, documentId);
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Document ${documentId} deleted successfully`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { detail: error?.message || "Failed to delete document" },
      { status: 500 }
    );
  }
}

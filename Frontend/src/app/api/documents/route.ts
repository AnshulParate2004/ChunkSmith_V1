import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/lib/supabase";
import { StorageManager } from "@/server/lib/storage";
import { ProjectRepository } from "@/server/lib/project-repository";
import { serverConfig } from "@/server/config";
import JSZip from "jszip";

const storage = new StorageManager();
const repo = new ProjectRepository();

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const documentId = url.searchParams.get("document_id");
    const projectId = url.searchParams.get("project_id");

    if (!documentId || !projectId) {
      return NextResponse.json({ detail: "document_id and project_id are required" }, { status: 400 });
    }

    let jsonBuffer: Buffer;
    try {
      jsonBuffer = await storage.downloadBuffer(
        `${projectId}/json/${documentId}_processed.json`,
        serverConfig.SUPABASE_DATA_BUCKET_NAME
      );
    } catch {
      jsonBuffer = await storage.downloadBuffer(
        `json/${documentId}_processed.json`,
        serverConfig.SUPABASE_DATA_BUCKET_NAME
      );
    }

    // Create zip with JSZip
    const zip = new JSZip();
    zip.file(`json/${documentId}.json`, jsonBuffer);

    const zipArrayBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return new Response(zipArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${documentId}_processed.zip"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to download document" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const documentId = url.searchParams.get("document_id");
    const projectId = url.searchParams.get("project_id");

    if (!documentId || !projectId) {
      return NextResponse.json({ detail: "document_id and project_id are required" }, { status: 400 });
    }

    await repo.softDeleteDocument(documentId, projectId);
    return NextResponse.json({ success: true, message: "Document deleted" });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to delete document" }, { status: 500 });
  }
}

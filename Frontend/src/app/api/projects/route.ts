import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/lib/supabase";
import { ProjectRepository } from "@/server/lib/project-repository";
import { StorageManager } from "@/server/lib/storage";
import { serverConfig } from "@/server/config";

const repo = new ProjectRepository();
const storage = new StorageManager();

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    const projects = await repo.listProjects(user?.id);
    return NextResponse.json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to list projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    const body = await request.json();
    const projectName = body.project_name || body.projectName;

    if (!projectName) {
      return NextResponse.json({ detail: "Project name is required" }, { status: 400 });
    }

    const projectId = projectName.trim().replace(/[\s/\\]+/g, "_");
    await repo.createProject(projectId, user?.id);

    // Create marker in storage buckets
    try {
      const buckets = [
        serverConfig.SUPABASE_PDF_BUCKET_NAME,
        serverConfig.SUPABASE_BUCKET_NAME,
        serverConfig.SUPABASE_DATA_BUCKET_NAME,
        serverConfig.SUPABASE_PKL_BUCKET_NAME,
      ];
      for (const bucket of buckets) {
        await storage.uploadBuffer(Buffer.from(""), `${projectId}/.keep`, "text/plain", bucket);
      }
    } catch {
      // Storage bucket keep file is optional
    }

    return NextResponse.json({
      success: true,
      message: "Project created",
      project_id: projectId,
      storage_path: `${projectId}/`,
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to create project" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/lib/supabase";
import { ProjectRepository } from "@/server/lib/project-repository";

const repo = new ProjectRepository();

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    const { projectId } = params;

    const project = await repo.getProject(projectId);
    if (!project) {
      return NextResponse.json({ detail: "Project not found" }, { status: 404 });
    }

    if (project.user_id && user?.id && project.user_id !== user.id) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }

    const docRows = await repo.getProjectDocuments(projectId);

    const pdfFiles = docRows.map((r: any) => ({
      filename: r.filename,
      size_mb: r.size_mb,
      created_at: r.created_at,
      id: r.id,
    }));

    return NextResponse.json({
      project_id: projectId,
      pdf_count: pdfFiles.length,
      chunks_in_db: docRows.reduce((acc: number, r: any) => acc + (r.chunk_count || 0), 0),
      image_count: docRows.reduce((acc: number, r: any) => acc + (r.image_count || 0), 0),
      documents: docRows.map((r: any) => r.id),
      pdf_files: pdfFiles,
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to load project" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    const { projectId } = params;

    const project = await repo.getProject(projectId);
    if (!project) {
      return NextResponse.json({ detail: "Project not found" }, { status: 404 });
    }

    if (project.user_id && user?.id && project.user_id !== user.id) {
      return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
    }

    await repo.softDeleteProject(projectId);
    return NextResponse.json({ success: true, message: "Project deleted" });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Failed to delete project" }, { status: 500 });
  }
}

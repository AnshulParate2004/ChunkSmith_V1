import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/lib/supabase";

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = params;
    return NextResponse.json({
      success: true,
      message: "Chat session initialized",
      project_id: projectId,
      session_id: projectId,
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Initialization failed" }, { status: 500 });
  }
}

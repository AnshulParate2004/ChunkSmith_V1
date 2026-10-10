import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/server/lib/supabase";

export async function PATCH(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  try {
    const { conversationId } = params;
    const body = await request.json();
    const { title } = body;

    if (!title) {
      return NextResponse.json({ detail: "title is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("conversations")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, conversation: data });
  } catch (error: any) {
    return NextResponse.json(
      { detail: error?.message || "Failed to update title" },
      { status: 500 }
    );
  }
}

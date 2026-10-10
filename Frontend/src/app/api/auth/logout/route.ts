import { NextResponse } from "next/server";
import { getSupabaseAdmin, getUserFromRequest } from "@/server/lib/supabase";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const supabase = getSupabaseAdmin();
      await supabase.auth.admin.signOut(token);
    }
    return NextResponse.json({ message: "Logged out successfully" });
  } catch {
    return NextResponse.json({ message: "Logged out" });
  }
}

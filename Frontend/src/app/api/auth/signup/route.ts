import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/server/lib/supabase";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ detail: "Email and password are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: "User registered successfully",
      user: data.user ? { id: data.user.id, email: data.user.email } : null,
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Internal server error" }, { status: 500 });
  }
}

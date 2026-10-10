import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/server/lib/supabase";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ detail: "Email and password are required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json({ detail: error?.message || "Invalid credentials" }, { status: 401 });
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      token_type: "bearer",
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Internal server error" }, { status: 500 });
  }
}

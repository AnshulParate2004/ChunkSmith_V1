import { NextResponse } from "next/server";
import { serverConfig } from "@/server/config";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    runtime: "node/nextjs",
    api_version: serverConfig.API_VERSION,
    active_processing: 0,
    active_chat_sessions: 0,
  });
}

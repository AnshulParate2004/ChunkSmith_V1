import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/server/lib/supabase";
import { VectorStoreManager } from "@/server/lib/vector-store";

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const { query, project_id, k = 5 } = await request.json();
    if (!query || !project_id) {
      return NextResponse.json({ detail: "Query and project_id are required" }, { status: 400 });
    }

    const vectorManager = new VectorStoreManager();
    const results = await vectorManager.search(project_id, query, k);

    const formattedResults = results.map((doc, idx) => ({
      rank: idx + 1,
      content: doc.page_content.length > 500 ? doc.page_content.slice(0, 500) + "..." : doc.page_content,
      metadata: doc.metadata,
    }));

    return NextResponse.json({
      success: true,
      project_id,
      query,
      results_count: formattedResults.length,
      results: formattedResults,
    });
  } catch (error: any) {
    return NextResponse.json({ detail: error?.message || "Search failed" }, { status: 500 });
  }
}

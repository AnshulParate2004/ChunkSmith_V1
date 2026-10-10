import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/server/lib/supabase";
import { serverConfig } from "@/server/config";

export async function GET(
  request: Request,
  { params }: { params: { projectId: string; filename: string } }
) {
  try {
    const { projectId, filename } = params;
    if (!filename) {
      return NextResponse.json({ detail: "filename is required" }, { status: 400 });
    }

    const cleanFilename = decodeURIComponent(filename).split("?")[0];
    const supabase = getSupabaseAdmin();

    const candidatePaths = [
      `${projectId}/images/${cleanFilename}`,
      `images/${cleanFilename}`,
      `${projectId}/${cleanFilename}`,
      cleanFilename,
    ];

    let imageBlob: Blob | null = null;
    let contentType = "image/png";

    if (cleanFilename.toLowerCase().endsWith(".jpg") || cleanFilename.toLowerCase().endsWith(".jpeg")) {
      contentType = "image/jpeg";
    } else if (cleanFilename.toLowerCase().endsWith(".webp")) {
      contentType = "image/webp";
    } else if (cleanFilename.toLowerCase().endsWith(".gif")) {
      contentType = "image/gif";
    } else if (cleanFilename.toLowerCase().endsWith(".svg")) {
      contentType = "image/svg+xml";
    }

    // Try chunk_images bucket first, then chunk_data bucket
    const candidateBuckets = [
      serverConfig.SUPABASE_BUCKET_NAME || "chunk_images",
      serverConfig.SUPABASE_DATA_BUCKET_NAME || "chunk_data",
    ];

    for (const bucket of candidateBuckets) {
      for (const p of candidatePaths) {
        try {
          const { data, error } = await supabase.storage.from(bucket).download(p);
          if (data && !error) {
            imageBlob = data;
            break;
          }
        } catch {}
      }
      if (imageBlob) break;
    }

    if (!imageBlob) {
      return NextResponse.json(
        { detail: `Image not found: ${cleanFilename}` },
        { status: 404 }
      );
    }

    const arrayBuffer = await imageBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Auto-detect jpeg magic bytes 0xFF 0xD8 if extension was png but bytes are jpeg
    if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      contentType = "image/jpeg";
    } else if (buffer.length > 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      contentType = "image/png";
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error: any) {
    console.error("Error serving project image:", error);
    return NextResponse.json(
      { detail: error?.message || "Failed to fetch image" },
      { status: 500 }
    );
  }
}

import { getSupabaseAdmin } from "./supabase";
import { serverConfig } from "../config";

export class StorageManager {
  private supabase = getSupabaseAdmin();

  async uploadBuffer(
    buffer: Buffer | Uint8Array,
    filePath: string,
    contentType: string,
    bucketName = serverConfig.SUPABASE_DATA_BUCKET_NAME
  ) {
    const { data, error } = await this.supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload error to ${bucketName}/${filePath}: ${error.message}`);
    }

    return data;
  }

  async downloadBuffer(filePath: string, bucketName = serverConfig.SUPABASE_DATA_BUCKET_NAME): Promise<Buffer> {
    const { data, error } = await this.supabase.storage.from(bucketName).download(filePath);
    if (error || !data) {
      throw new Error(`Download error from ${bucketName}/${filePath}: ${error?.message || "File not found"}`);
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  getPublicUrl(filePath: string, bucketName = serverConfig.SUPABASE_BUCKET_NAME): string {
    const { data } = this.supabase.storage.from(bucketName).getPublicUrl(filePath);
    return data.publicUrl;
  }
}

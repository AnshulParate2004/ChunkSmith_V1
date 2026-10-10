import { getSupabaseAdmin } from "./supabase";

export class ProjectRepository {
  private supabase = getSupabaseAdmin();

  async getProject(projectId: string) {
    const { data, error } = await this.supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error || !data) return null;
    return data;
  }

  async createProject(projectId: string, userId?: string) {
    const { data: existing } = await this.supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .single();

    if (existing) {
      if (userId && existing.user_id && existing.user_id !== userId) {
        throw new Error("Project belongs to a different user");
      }
      if (userId && !existing.user_id) {
        const { data: updated } = await this.supabase
          .from("projects")
          .update({ user_id: userId })
          .eq("id", projectId)
          .select()
          .single();
        return updated || existing;
      }
      return existing;
    }

    const { data, error } = await this.supabase
      .from("projects")
      .insert({ id: projectId, user_id: userId || null })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }
    return data;
  }

  async listProjects(userId?: string) {
    let query = this.supabase
      .from("projects")
      .select("id, created_at, user_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    const projectsWithCounts = await Promise.all(
      data.map(async (p) => {
        const count = await this.countDocuments(p.id);
        return {
          project_id: p.id,
          project_path: `supabase://${p.id}`,
          file_count: count,
          created_at: p.created_at,
        };
      })
    );

    return projectsWithCounts;
  }

  async countDocuments(projectId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "completed")
      .is("deleted_at", null);

    if (error || typeof count !== "number") return 0;
    return count;
  }

  async getProjectDocuments(projectId: string) {
    const { data, error } = await this.supabase
      .from("documents")
      .select("id, filename, status, image_count, chunk_count, size_mb, created_at")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data;
  }

  async softDeleteProject(projectId: string) {
    await this.supabase
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", projectId);

    await this.supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("project_id", projectId);
  }

  async softDeleteDocument(documentId: string, projectId: string) {
    await this.supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", documentId)
      .eq("project_id", projectId);
  }
}

"""Project and document metadata in Supabase PostgreSQL (replaces bucket listing)."""
from typing import List, Optional
from supabase import Client
from datetime import datetime


class ProjectRepository:
    """Manages projects and documents in Supabase PostgreSQL."""

    def __init__(self, client: Client):
        self.client = client

    def create_project(self, project_id: str, user_id: Optional[str] = None) -> dict:
        """Insert a new project."""
        data = {"id": project_id, "user_id": user_id}
        result = self.client.table("projects").upsert(
            data, on_conflict="id", ignore_duplicates=False
        ).execute()
        return result.data[0] if result.data else data

    def list_projects(self, user_id: Optional[str] = None) -> List[dict]:
        """
        List all projects. If user_id provided, filter by it.
        Returns list with project_id, created_at, file_count.
        """
        query = self.client.table("projects").select(
            "id, created_at"
        ).is_("deleted_at", "null").order("created_at", desc=True)
        result = query.execute()
        if not result.data:
            return []

        projects = []
        for row in result.data:
            pid = row.get("id")
            doc_count = self._count_documents(pid)
            projects.append({
                "project_id": pid,
                "project_path": f"supabase://{pid}",
                "file_count": doc_count,
                "created_at": row.get("created_at"),
            })
        return projects

    def _count_documents(self, project_id: str) -> int:
        """Count completed documents in a project."""
        result = self.client.table("documents").select(
            "*", count="exact"
        ).eq("project_id", project_id).eq("status", "completed").is_("deleted_at", "null").limit(1).execute()
        return getattr(result, "count", None) or 0

    def get_project_documents(
        self, project_id: str
    ) -> List[dict]:
        """Get document metadata for a project (replaces listing PDF bucket)."""
        result = self.client.table("documents").select(
            "id, filename, status, image_count, chunk_count, size_mb, created_at"
        ).eq("project_id", project_id).is_("deleted_at", "null").order("created_at", desc=True).execute()
        if not result.data:
            return []

        return [
            {
                "filename": row.get("filename", ""),
                "id": row.get("id"),
                "size_mb": float(row.get("size_mb") or 0),
                "created_at": row.get("created_at"),
                "status": row.get("status"),
                "image_count": row.get("image_count") or 0,
            }
            for row in result.data
        ]

    def upsert_document(
        self,
        document_id: str,
        project_id: str,
        filename: str,
        status: str = "processing",
        pdf_path: Optional[str] = None,
        json_path: Optional[str] = None,
        size_mb: Optional[float] = None,
        image_count: int = 0,
        chunk_count: int = 0,
    ) -> dict:
        """Insert or update a document record."""
        data = {
            "id": document_id,
            "project_id": project_id,
            "filename": filename,
            "status": status,
            "pdf_path": pdf_path,
            "json_path": json_path,
            "image_count": image_count,
            "chunk_count": chunk_count,
            "updated_at": datetime.utcnow().isoformat(),
        }
        if size_mb is not None:
            data["size_mb"] = round(size_mb, 2)
        result = self.client.table("documents").upsert(
            data, on_conflict="id"
        ).execute()
        return result.data[0] if result.data else data

    def soft_delete_project(self, project_id: str) -> None:
        """
        Shadow/soft delete: mark project and its documents as deleted.
        No actual row removal; records stay for recovery/audit.
        """
        now = datetime.utcnow().isoformat()
        # Soft delete documents first
        self.client.table("documents").update(
            {"deleted_at": now}
        ).eq("project_id", project_id).execute()
        # Soft delete project
        self.client.table("projects").update(
            {"deleted_at": now}
        ).eq("id", project_id).execute()

    def soft_delete_document(self, document_id: str, project_id: str) -> None:
        """Shadow delete a single document."""
        self.client.table("documents").update(
            {"deleted_at": datetime.utcnow().isoformat()}
        ).eq("id", document_id).eq("project_id", project_id).execute()

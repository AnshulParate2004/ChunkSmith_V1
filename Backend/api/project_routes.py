"""Project management API routes"""
from datetime import datetime
import shutil
import tempfile
import zipfile
import os
import logging
from fastapi import APIRouter, HTTPException, Query, Depends


from fastapi.responses import FileResponse
from config.settings import settings
from utils.storage import StorageManager
from utils.vector_store import VectorStoreManager
from utils.project_repository import ProjectRepository
from api.shared import ProjectCreateRequest
from api.auth_routes import get_current_user, get_supabase_client

router = APIRouter(prefix="/projects", tags=["Project Management"])


@router.post("")
async def create_project(request: ProjectCreateRequest, user = Depends(get_current_user)):
    """Create a new project (PostgreSQL + Supabase storage)."""
    try:
        project_id = request.project_name.replace(" ", "_").replace("/", "_").replace("\\", "_")
        
        # Insert into PostgreSQL
        supabase = get_supabase_client()
        repo = ProjectRepository(supabase)
        user_id = str(user.id) if hasattr(user, "id") else None
        repo.create_project(project_id, user_id=user_id)
        
        # Optional: create folder structure in buckets (for storage uploads)
        try:
            storage_mgr = StorageManager()
            for bucket in [
                settings.SUPABASE_PDF_BUCKET_NAME,
                settings.SUPABASE_BUCKET_NAME,
                settings.SUPABASE_DATA_BUCKET_NAME,
                settings.SUPABASE_PKL_BUCKET_NAME,
            ]:
                storage_mgr.upload_bytes(b"", f"{project_id}/.keep", "text/plain", bucket)
        except Exception as e:
            pass

        return {
            "success": True,
            "message": "Project created (PostgreSQL + Cloud backed)",
            "project_id": project_id,
            "storage_path": f"{project_id}/"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def list_projects(user = Depends(get_current_user)):
    """List all projects from PostgreSQL (excludes soft-deleted)."""
    try:
        supabase = get_supabase_client()
        repo = ProjectRepository(supabase)
        user_id = str(user.id) if hasattr(user, "id") else None
        projects = repo.list_projects(user_id=user_id)
        return {
            "success": True,
            "count": len(projects),
            "projects": projects
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}")
async def get_project_details(project_id: str, user = Depends(get_current_user)):
    """Get detailed information about a project (from PostgreSQL)."""
    try:
        supabase = get_supabase_client()
        repo = ProjectRepository(supabase)

        # Ensure the project belongs to the current user
        user_id = str(user.id) if hasattr(user, "id") else None
        if not user_id:
            raise HTTPException(status_code=401, detail="User not authenticated")

        project_row = repo.get_project(project_id)
        if not project_row:
            raise HTTPException(status_code=404, detail="Project not found")
        if project_row.get("user_id") and str(project_row["user_id"]) != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to access this project")

        doc_rows = repo.get_project_documents(project_id)
        
        pdf_files = [
            {"filename": r["filename"], "size_mb": r["size_mb"], "created_at": r["created_at"], "id": r["id"]}
            for r in doc_rows
        ]
        image_count = sum(r.get("image_count", 0) for r in doc_rows)
        
        doc_count = 0
        has_vector_store = False
        try:
            vector_manager = VectorStoreManager(embedding_model=settings.AZURE_OPENAI_EMBEDDING_MODEL)
            doc_count = vector_manager.get_project_document_count(project_id)
            has_vector_store = doc_count > 0
        except Exception as ve:
            pass

        return {
            "success": True,
            "project_id": project_id,
            "project_path": f"supabase://{project_id}",
            "pdf_files": pdf_files,
            "pdf_count": len(pdf_files),
            "image_count": image_count,
            "has_vector_store": has_vector_store,
            "chunks_in_db": doc_count
        }
    
    except Exception as e:

        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_id}")
async def delete_project(project_id: str, user = Depends(get_current_user)):
    """
    Shadow/soft delete: marks project and documents as deleted in PostgreSQL.
    Storage buckets and vector store are NOT deleted - data is preserved for recovery.
    """
    try:
        supabase = get_supabase_client()
        repo = ProjectRepository(supabase)

        # Ensure the project belongs to the current user before deleting
        user_id = str(user.id) if hasattr(user, "id") else None
        if not user_id:
            raise HTTPException(status_code=401, detail="User not authenticated")

        project_row = repo.get_project(project_id)
        if not project_row:
            raise HTTPException(status_code=404, detail="Project not found")
        if project_row.get("user_id") and str(project_row["user_id"]) != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this project")

        # Soft delete in PostgreSQL (projects + documents)
        try:
            repo.soft_delete_project(project_id)
        except Exception as db_err:

            raise HTTPException(
                status_code=500,
                detail=f"Could not delete project: {str(db_err)}. Ensure projects/documents tables exist."
            )
        
        return {
            "success": True,
            "message": f"Project '{project_id}' deleted (soft delete - hidden from listings)",
            "project_id": project_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{project_id}/documents/{document_id}")
async def delete_document(project_id: str, document_id: str, user = Depends(get_current_user)):
    """
    Shadow/soft delete a single processed document in a project.
    Storage buckets and vector store are NOT deleted - rows are just hidden.
    """
    try:
        supabase = get_supabase_client()
        repo = ProjectRepository(supabase)

        # Ensure the project belongs to the current user
        user_id = str(user.id) if hasattr(user, "id") else None
        if not user_id:
            raise HTTPException(status_code=401, detail="User not authenticated")

        project_row = repo.get_project(project_id)
        if not project_row:
            raise HTTPException(status_code=404, detail="Project not found")
        if project_row.get("user_id") and str(project_row["user_id"]) != user_id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this project")

        # Soft delete the document row
        repo.soft_delete_document(document_id=document_id, project_id=project_id)

        return {
            "success": True,
            "message": f"Document '{document_id}' deleted (soft delete - hidden from listings)",
            "project_id": project_id,
            "document_id": document_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download-all")
async def download_all_projects(user = Depends(get_current_user)):
    """Download ALL projects data as a single ZIP file"""
    try:
        projects = settings.list_projects()
        
        if not projects:
            raise HTTPException(status_code=404, detail="No projects found")
        
        # Create temporary ZIP file
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        
        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add each project's data to ZIP
            for project in projects:
                project_id = project["project_id"]
                project_dir = settings.get_project_dir(project_id)
                
                if project_dir.exists():
                    # Add all files from this project
                    for item in project_dir.rglob("*"):
                        if item.is_file():
                            # Create path like: learning/uploads/file.pdf
                            rel_path = item.relative_to(project_dir.parent)
                            zipf.write(item, rel_path)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"all_projects_{timestamp}.zip"
        
        return FileResponse(
            path=temp_zip.name,
            filename=filename,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create archive: {str(e)}")


@router.get("/download-project/{project_id}")
async def download_project_data(project_id: str, user = Depends(get_current_user)):
    """Download all data for a specific project as ZIP"""
    try:
        project_dir = settings.get_project_dir(project_id)
        
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
        
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        
        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for item in project_dir.rglob("*"):
                if item.is_file():
                    rel_path = item.relative_to(project_dir)
                    zipf.write(item, rel_path)
        
        return FileResponse(
            path=temp_zip.name,
            filename=f"{project_id}_data.zip",
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={project_id}_data.zip"}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create archive: {str(e)}")


@router.get("/download-project-documents/{project_id}")
async def download_project_documents_only(project_id: str, user = Depends(get_current_user)):
    """Download only the processed documents (JSON files) for a specific project"""
    try:
        json_dir = settings.get_project_json_dir(project_id)
        
        if not json_dir.exists():
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
        
        json_files = list(json_dir.glob("*.json"))
        
        if not json_files:
            raise HTTPException(
                status_code=404, 
                detail=f"No processed documents found in project '{project_id}'"
            )
        
        # Create temporary ZIP file
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        
        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for json_file in json_files:
                zipf.write(json_file, json_file.name)
        
        return FileResponse(
            path=temp_zip.name,
            filename=f"{project_id}_documents.zip",
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={project_id}_documents.zip"}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create archive: {str(e)}")

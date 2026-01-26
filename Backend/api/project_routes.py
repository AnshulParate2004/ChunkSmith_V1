"""Project management API routes"""
from datetime import datetime
import shutil
import tempfile
import zipfile
import os
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from config.settings import settings
from utils.storage import StorageManager
from utils.vector_store import VectorStoreManager
from api.shared import ProjectCreateRequest

router = APIRouter(prefix="/projects", tags=["Project Management"])


@router.post("")
async def create_project(request: ProjectCreateRequest):
    """Create a new project (Virtual/Supabase-backed)"""
    try:
        # Sanitize project name
        project_id = request.project_name.replace(" ", "_").replace("/", "_").replace("\\", "_")
        
        # Initialize Supabase Storage
        storage_mgr = StorageManager()
        
        # Check if project exists (optional but good practice)
        # We'll just ensure the folder structure exists by uploading a placeholder
        # This allows empty projects to be listed and folders to exist in all buckets
        try:
             buckets = [
                settings.SUPABASE_PDF_BUCKET_NAME,
                settings.SUPABASE_BUCKET_NAME,      # images
                settings.SUPABASE_DATA_BUCKET_NAME, # json
                settings.SUPABASE_PKL_BUCKET_NAME
             ]
             
             for bucket in buckets:
                 # Upload a hidden .keep file to create the folder structure
                 storage_mgr.upload_bytes(
                     b"", 
                     f"{project_id}/.keep", 
                     "text/plain", 
                     bucket
                 )
        except Exception as e:
            # If upload fails, we still return success but warn log?
            print(f"Warning: Failed to create placeholder for project {project_id}: {e}")

        return {
            "success": True,
            "message": "Project initialized (Cloud backed)",
            "project_id": project_id,
            "storage_path": f"{project_id}/"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def list_projects():
    """List all projects (from Supabase)"""
    try:
        storage_mgr = StorageManager()
        # List root of pdf bucket to find project folders
        items = storage_mgr.list_bucket_contents(settings.SUPABASE_PDF_BUCKET_NAME)
        
        projects = []
        # Support for both dictionary and object return types from supabase-py
        for item in items:
            name = item.get('name') if isinstance(item, dict) else getattr(item, 'name', None)
            created_at = item.get('created_at') if isinstance(item, dict) else getattr(item, 'created_at', datetime.now().isoformat())
            
            # Filter out obvious non-folders if possible, or just treat root items as projects
            if name and not name.startswith('.'): 
                # Count files in this project (excluding hidden files like .keep)
                project_files = storage_mgr.list_bucket_contents(settings.SUPABASE_PDF_BUCKET_NAME, path=f"{name}/")
                
                # Filter out hidden files
                visible_files = []
                if project_files:
                    for f in project_files:
                        fname = f.get('name') if isinstance(f, dict) else getattr(f, 'name', '')
                        if fname and not fname.startswith('.'):
                            visible_files.append(f)
                
                file_count = len(visible_files)
                
                projects.append({
                    "project_id": name,
                    "project_path": f"supabase://{name}",
                    "file_count": file_count, 
                    "created_at": created_at
                })
        
        return {
            "success": True,
            "count": len(projects),
            "projects": projects
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{project_id}")
async def get_project_details(project_id: str):
    """Get detailed information about a project (from Supabase)"""
    try:
        storage_mgr = StorageManager()
        
        # Fetch PDFs from Supabase
        pdf_items = storage_mgr.list_bucket_contents(
            settings.SUPABASE_PDF_BUCKET_NAME, 
            path=f"{project_id}/"
        )
        
        # Fetch Images from Supabase (Correct path: project_id/images/)
        image_items = storage_mgr.list_bucket_contents(
            settings.SUPABASE_BUCKET_NAME, 
            path=f"{project_id}/images/"
        )
        
        pdf_files = []
        if isinstance(pdf_items, list):
            for item in pdf_items:
                name = item.get('name') if isinstance(item, dict) else getattr(item, 'name', None)
                metadata = item.get('metadata', {}) if isinstance(item, dict) else getattr(item, 'metadata', {})
                created_at = item.get('created_at') if isinstance(item, dict) else getattr(item, 'created_at', None)
                item_id = item.get('id') if isinstance(item, dict) else getattr(item, 'id', None)
                
                # Handle size which might be in metadata or direct attribute
                size = metadata.get('size', 0)
                
                if name and not name.startswith('.'):
                    pdf_files.append({
                        "filename": name, 
                        "size_mb": round(float(size) / (1024*1024), 2),
                        "created_at": created_at,
                        "id": item_id
                    })

        # Filter out folder placeholders if any (items ending in / or empty names)
        # Supabase list sometimes returns the folder itself as an item?
        real_images = [img for img in (image_items or []) if (img.get('name') if isinstance(img, dict) else getattr(img, 'name', '')).lower().endswith(('.png', '.jpg', '.jpeg'))]
        image_count = len(real_images)

        # Get vector store info and exact count
        doc_count = 0
        has_vector_store = False
        try:
           vector_manager = VectorStoreManager(embedding_model=settings.EMBEDDING_MODEL)
           doc_count = vector_manager.get_project_document_count(project_id)
           has_vector_store = doc_count > 0
        except Exception as ve:
           print(f"Vector count error: {ve}")
        
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
async def delete_project(project_id: str):
    """Delete an entire project and all its data (Supabase + Local)"""
    try:
        # 1. Supabase Storage Cleanup
        storage_mgr = StorageManager()
        # List of buckets to clean (PDF, Images, JSON, Pickle)
        buckets = [
            settings.SUPABASE_PDF_BUCKET_NAME,
            settings.SUPABASE_BUCKET_NAME,      # chunk_images
            settings.SUPABASE_DATA_BUCKET_NAME, # chunk_data
            settings.SUPABASE_PKL_BUCKET_NAME
        ]
        
        for bucket in buckets:
            # Delete all files with project prefix
            storage_mgr.delete_folder(bucket, f"{project_id}/")
            
        # 2. Supabase Vector Cleanup
        try:
            vector_manager = VectorStoreManager(embedding_model=settings.EMBEDDING_MODEL)
            vector_manager.delete_project_vectors(project_id)
        except Exception as ve:
             print(f"Vector cleanup error: {ve}")

        # 3. Local Cleanup (Virtual check)
        project_dir = settings.get_project_dir(project_id)
        if project_dir.exists():
            shutil.rmtree(project_dir)
        
        return {
            "success": True,
            "message": f"Project '{project_id}' deleted successfully (Cloud & Local data removed)",
            "project_id": project_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download-all")
async def download_all_projects():
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
async def download_project_data(project_id: str):
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
async def download_project_documents_only(project_id: str):
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

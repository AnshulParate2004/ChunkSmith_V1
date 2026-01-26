import os
import shutil
import json
import asyncio
from datetime import datetime
from api.deps import get_current_user, get_supabase_client
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Query, Depends
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, AsyncGenerator
from pathlib import Path
import zipfile
import tempfile
import pickle

from config.settings import settings
from core.document_parser import DocumentParser
from core.content_processor import ContentProcessor
from utils.vector_store import VectorStoreManager
from utils.file_helpers import FileHandler
from core.chat_agent import ChatAgent
from utils.storage import StorageManager
from typing import Dict
from unstructured.chunking.title import chunk_by_title

# Store active chat agents (Project Level Cache)
# Key: project_id
chat_agents: Dict[str, ChatAgent] = {}
router = APIRouter()

# Store processing status for each document
processing_status = {}


class ProcessRequest(BaseModel):
    """Request model for document processing"""
    project_id: str  # NEW: Project identifier
    max_characters: Optional[int] = settings.MAX_CHARACTERS
    new_after_n_chars: Optional[int] = settings.NEW_AFTER_N_CHARS
    combine_text_under_n_chars: Optional[int] = settings.COMBINE_TEXT_UNDER_N_CHARS
    extract_images: Optional[bool] = settings.EXTRACT_IMAGES
    extract_tables: Optional[bool] = settings.EXTRACT_TABLES
    languages: Optional[List[str]] = settings.LANGUAGES


class ProjectCreateRequest(BaseModel):
    """Request model for creating a new project"""
    project_name: str


class SearchRequest(BaseModel):
    """Request model for vector search"""
    query: str
    project_id: str  # NEW: Search within specific project
    k: Optional[int] = 5


async def send_sse_message(message_type: str, data: dict) -> str:
    """Format SSE message"""
    message = {
        "type": message_type,
        "data": data,
        "timestamp": datetime.now().isoformat()
    }
    return f"data: {json.dumps(message)}\n\n"


# ============================================
# PROJECT MANAGEMENT ENDPOINTS
# ============================================

@router.post("/projects")
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


@router.get("/projects")
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


@router.get("/projects/{project_id}")
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


@router.delete("/projects/{project_id}")
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


# ============================================
# PDF PROCESSING ENDPOINTS (PROJECT-BASED)
# ============================================

@router.post("/process-pdf")
async def initiate_pdf_processing(
    project_id: str = Query(..., description="Project ID where this PDF belongs"),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    max_characters: int = settings.MAX_CHARACTERS,
    new_after_n_chars: int = settings.NEW_AFTER_N_CHARS,
    combine_text_under_n_chars: int = settings.COMBINE_TEXT_UNDER_N_CHARS,
    extract_images: bool = settings.EXTRACT_IMAGES,
    extract_tables: bool = settings.EXTRACT_TABLES,
    languages: str = "english",
):
    """
    Process PDF and add to project (Supabase-only storage)
    """
    try:
        # Verify project exists - Virtual check
        # We don't error if it doesn't exist locally since we are cloud-only
        
        # Generate unique document ID
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        document_id = f"{file.filename.replace('.pdf', '')}_{timestamp}"
        
        # Save uploaded file to a temporary file (auto-cleanup handled later)
        # We use delete=False so we can pass the path to the background task
        # The background task will delete it upon completion
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
        upload_path = temp_file.name
        
        content = await file.read()
        temp_file.write(content)
        temp_file.close() # Close handle so others can read
            
        # Validate PDF
        is_valid, error_msg = FileHandler.validate_pdf(
            upload_path, 
            settings.MAX_FILE_SIZE // (1024 * 1024)
        )
        if not is_valid:
            os.remove(upload_path)
            raise HTTPException(status_code=400, detail=error_msg)
        
        # Upload PDF to Supabase PDF Bucket
        try:
            storage_mgr = StorageManager()
            with open(upload_path, 'rb') as pdf_file:
                pdf_content = pdf_file.read()
                
            storage_mgr.upload_data(
                pdf_content, 
                f"{project_id}/{document_id}.pdf", 
                "application/pdf",
                bucket_name=settings.SUPABASE_PDF_BUCKET_NAME
            )
            print(f"Uploaded PDF to Supabase: {document_id}.pdf")
        except Exception as e:
            print(f"Error uploading PDF to Supabase: {e}")
            # Non-critical for processing, but good to know
        
        # Initialize status
        processing_status[document_id] = {
            "status": "queued",
            "progress": 0,
            "message": "Processing queued",
            "project_id": project_id
        }
        
        # Start background processing
        background_tasks.add_task(
            process_pdf_background,
            project_id,
            document_id,
            upload_path,
            max_characters,
            new_after_n_chars,
            combine_text_under_n_chars,
            extract_images,
            extract_tables,
            languages
        )
        
        return {
            "success": True,
            "message": "Processing initiated",
            "project_id": project_id,
            "document_id": document_id,
            "stream_url": f"/api/process-pdf-stream/{document_id}"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/process-pdf-stream/{document_id}")
async def stream_pdf_processing(document_id: str): 
    """Stream processing updates via Server-Sent Events (SSE)"""
    
    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # Wait for processing to start
            max_wait = 30
            waited = 0
            while document_id not in processing_status and waited < max_wait:
                await asyncio.sleep(0.5)
                waited += 0.5
            
            if document_id not in processing_status:
                yield await send_sse_message("error", {
                    "message": "Processing not found or timed out"
                })
                return
            
            # Send initial connection message
            yield await send_sse_message("connected", {
                "message": "Connected to processing stream",
                "document_id": document_id
            })
            
            last_status = None
            
            # Stream updates
            while True:
                if document_id in processing_status:
                    current_status = processing_status[document_id]
                    
                    # Only send if status changed
                    if current_status != last_status:
                        yield await send_sse_message("progress", current_status)
                        last_status = current_status.copy()
                    
                    # Check if completed or failed
                    if current_status.get("status") in ["completed", "failed"]:
                        # Send final message
                        if current_status.get("status") == "completed":
                            yield await send_sse_message("complete", current_status)
                        else:
                            yield await send_sse_message("error", current_status)
                        
                        # Cleanup after 5 seconds
                        await asyncio.sleep(5)
                        if document_id in processing_status:
                            del processing_status[document_id]
                        break
                
                await asyncio.sleep(1)
        
        except asyncio.CancelledError:
            pass
        except Exception as e:
            yield await send_sse_message("error", {
                "message": f"Stream error: {str(e)}"
            })
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


async def process_pdf_background(
    project_id: str,
    document_id: str,
    upload_path: str,
    max_characters: int,
    new_after_n_chars: int,
    combine_text_under_n_chars: int,
    extract_images: bool,
    extract_tables: bool,
    languages: str
):
    """Background task for PDF processing with project-based storage"""
    
    try:
        # Create a temporary workspace for this task to ensure no local artifacts remain
        temp_dir = tempfile.mkdtemp()
        image_dir = Path(temp_dir) / "images"
        pickle_dir = Path(temp_dir) / "pickle"
        json_dir = Path(temp_dir) / "json"
        chroma_dir = "supabase_vector_store" # No local chroma dir needed
        
        image_dir.mkdir(parents=True, exist_ok=True)
        pickle_dir.mkdir(parents=True, exist_ok=True)
        json_dir.mkdir(parents=True, exist_ok=True)
        
        # Update status: Starting
        processing_status[document_id] = {
            "status": "processing",
            "step": 1,
            "step_name": "upload",
            "progress": 5,
            "message": "File uploaded and validated",
            "project_id": project_id
        }
        await asyncio.sleep(0.5)
        
        # Step 2: Parse PDF
        processing_status[document_id] = {
            "status": "processing",
            "step": 2,
            "step_name": "parsing",
            "progress": 10,
            "message": "Step 2: Parsing PDF document...",
            "project_id": project_id
        }
        
        language_list = [lang.strip() for lang in languages.split(',')]
        parser = DocumentParser(
            image_output_dir=str(image_dir),
            api_key=os.getenv("UNSTRUCTURED_API_KEY")
        )
        
        loop = asyncio.get_event_loop()
        # Note: Unstructured API doesn't use chunking params in partition call
        # Chunking happens after with chunk_by_title
        elements = await loop.run_in_executor(
            None,
            parser.partition_pdf_document,
            upload_path,
            max_characters,
            new_after_n_chars,
            combine_text_under_n_chars,
            extract_images,
            extract_tables,
            language_list,
            settings.SPLIT_PDF_CONCURRENCY_LEVEL
        )
        
        checkpoint1_path = os.path.join(pickle_dir, f"{document_id}_checkpoint1.pkl")
        FileHandler.save_pickle(elements, checkpoint1_path)
        
        processing_status[document_id] = {
            "status": "processing",
            "step": 2,
            "step_name": "parsing",
            "progress": 25,
            "message": f"Extracted {len(elements)} elements",
            "elements_count": len(elements),
            "project_id": project_id
        }
        await asyncio.sleep(0.5)
        
        # Step 2.5: Chunk elements by title
        processing_status[document_id] = {
            "status": "processing",
            "step": 2,
            "step_name": "chunking",
            "progress": 28,
            "message": "Chunking elements by title...",
            "project_id": project_id
        }
        
        # Chunk by title with keyword arguments
        def chunk_elements():
            return chunk_by_title(
                elements=elements,
                max_characters=max_characters,
                new_after_n_chars=new_after_n_chars,
                combine_text_under_n_chars=combine_text_under_n_chars
            )
        
        elements = await loop.run_in_executor(None, chunk_elements)
        
        processing_status[document_id] = {
            "status": "processing",
            "step": 2,
            "step_name": "chunking",
            "progress": 30,
            "message": f"Created {len(elements)} chunks",
            "chunks_count": len(elements),
            "project_id": project_id
        }
        await asyncio.sleep(0.5)
        
        # Step 3: AI Processing
        processing_status[document_id] = {
            "status": "processing",
            "step": 3,
            "step_name": "ai_processing",
            "progress": 35,
            "message": "Step 3: Processing chunks with AI...",
            "total_chunks": len(elements),
            "project_id": project_id
        }
        
        processor = ContentProcessor(
            image_dir=str(image_dir),
            model_name=settings.GEMINI_MODEL,
            temperature=settings.TEMPERATURE,
            project_id=project_id
        )
        
        documents = await loop.run_in_executor(
            None,
            processor.summarise_chunks,
            elements
        )
        
        image_count = len(list(image_dir.glob("*.png")))
        
        output_pickle_path = f"pickle/{document_id}_processed.pkl"
        output_json_path = f"json/{document_id}_processed.json"
        
        # Upload to Supabase Data Bucket
        # We use project_id as folder prefix for better organization if needed, but the paths above are standard
        # Actually in settings we define project specific dirs, let's keep that structure in bucket
        
        # Save Pickle and JSON to Supabase with error handling
        storage_mgr = StorageManager()
        try:
            print(f"DEBUG: Attempting to upload Pickle to bucket '{settings.SUPABASE_PKL_BUCKET_NAME}' at '{project_id}/{output_pickle_path}'")
            storage_mgr.upload_data(
                pickle.dumps(documents), 
                f"{project_id}/{output_pickle_path}", 
                "application/octet-stream",
                bucket_name=settings.SUPABASE_PKL_BUCKET_NAME
            )
            print(f"SUCCESS: Uploaded Pickle to Supabase")
        except Exception as e:
            print(f"ERROR: Failed to upload Pickle to Supabase: {e}")
            # Do not re-raise, allow processing to continue if possible?
            # Actually, if pickle fails, we might still want to try JSON

        try:
            print(f"DEBUG: Attempting to upload JSON to bucket '{settings.SUPABASE_DATA_BUCKET_NAME}' at '{project_id}/{output_json_path}'")
            
            docs_dict = []
            for doc in documents:
                # Flatten structure: content + metadata at top level
                item = doc.metadata.copy()
                item["enhanced_content"] = doc.page_content
                docs_dict.append(item)
            
            storage_mgr.upload_data(
                json.dumps(docs_dict, indent=4, ensure_ascii=False).encode('utf-8'), 
                f"{project_id}/{output_json_path}", 
                "application/json",
                bucket_name=settings.SUPABASE_DATA_BUCKET_NAME
            )
            print(f"SUCCESS: Uploaded JSON to Supabase")
        except Exception as e:
            print(f"ERROR: Failed to upload JSON to Supabase: {e}")
        
        processing_status[document_id] = {
            "status": "processing",
            "step": 3,
            "step_name": "ai_processing",
            "progress": 70,
            "message": f"Processed {len(documents)} chunks",
            "chunks_processed": len(documents),
            "images_extracted": image_count,
            "project_id": project_id
        }
        await asyncio.sleep(0.5)
        
        # Step 4: Vector Store (APPEND mode)
        processing_status[document_id] = {
            "status": "processing",
            "step": 4,
            "step_name": "vectorization",
            "progress": 75,
            "message": "Step 4: Adding to vector database (Supabase)...",
            "project_id": project_id
        }
        
        vector_manager = VectorStoreManager(embedding_model=settings.EMBEDDING_MODEL)
        
        # Use append_to_vector_store
        vectorstore = await loop.run_in_executor(
            None,
            vector_manager.append_to_vector_store,
            documents,
            None, # persist_directory unused
            project_id
        )
        
        processing_status[document_id] = {
            "status": "processing",
            "step": 4,
            "step_name": "vectorization",
            "progress": 95,
            "message": "Vector store updated",
            "project_id": project_id
        }
        await asyncio.sleep(0.5)
        
        # Cleanup local temporary files (PDF and Temp Directory)
        try:
            if os.path.exists(upload_path):
                os.remove(upload_path)
                print(f"Cleaned up local PDF: {upload_path}")
            
            if 'temp_dir' in locals() and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
                print(f"Cleaned up temporary working directory: {temp_dir}")
                
        except Exception as cleanup_error:
            print(f"Warning: Failed to cleanup local files: {cleanup_error}")

        # Complete
        processing_status[document_id] = {
            "status": "completed",
            "progress": 100,
            "message": "Processing complete!",
            "project_id": project_id,
            "result": {
                "document_id": document_id,
                "chunks_processed": len(documents),
                "images_extracted": image_count,
                "pickle_path": output_pickle_path,
                "json_path": output_json_path,
                "vector_store_path": str(chroma_dir)
            }
        }
    
    except Exception as e:
        processing_status[document_id] = {
            "status": "failed",
            "progress": 0,
            "message": f"Error: {str(e)}",
            "project_id": project_id
        }
        print(f"Error processing PDF: {e}")



# ============================================
# CHAT ENDPOINTS (PROJECT-BASED)
# ============================================

# ============================================
# CHAT ENDPOINTS (PERSISTENT & AUTHENTICATED)
# ============================================

class CreateConversationRequest(BaseModel):
    project_id: str
    title: str = "New Conversation"

@router.post("/chat/conversations")
async def create_conversation(
    request: CreateConversationRequest,
    user = Depends(get_current_user)
):
    """Create a new conversation"""
    try:
        supabase = get_supabase_client()
        
        # Insert into conversations table
        response = supabase.table("conversations").insert({
            "user_id": user.id,
            "project_id": request.project_id,
            "title": request.title
        }).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create conversation")
            
        return {
            "success": True,
            "conversation": response.data[0]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/chat/conversations")
async def list_conversations(
    project_id: Optional[str] = None,
    user = Depends(get_current_user)
):
    """List user's conversations, optionally filtered by project"""
    try:
        supabase = get_supabase_client()
        
        query = supabase.table("conversations").select("*").eq("user_id", user.id).order("updated_at", desc=True)
        
        if project_id:
            query = query.eq("project_id", project_id)
            
        response = query.execute()
        
        return {
            "success": True,
            "count": len(response.data),
            "conversations": response.data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/chat/conversations/{conversation_id}/messages")
async def get_conversation_history(
    conversation_id: str,
    user = Depends(get_current_user)
):
    """Get history for a specific conversation"""
    try:
        supabase = get_supabase_client()
        
        # Verify ownership
        conv = supabase.table("conversations").select("id").eq("id", conversation_id).eq("user_id", user.id).execute()
        if not conv.data:
            raise HTTPException(status_code=404, detail="Conversation not found")
            
        # Fetch messages
        response = supabase.table("messages").select("*").eq("conversation_id", conversation_id).order("created_at", desc=False).execute()
        
        return {
            "success": True,
            "messages": response.data
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat/conversations/{conversation_id}/message_stream")
async def stream_chat_message(
    conversation_id: str,
    message: str = Query(..., description="User message"),
    token: str = Query(..., description="Auth token (since EventSource cannot send headers easily)"),
    # Access token retrieval manually since streaming endpoint usually uses query param for auth
):
    """Stream chat response for a conversation"""
    
    # Manually validate token for stream
    try:
        supabase = get_supabase_client()
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
             raise HTTPException(status_code=401, detail="Invalid token")
        user = user_response.user
    except Exception as e:
        raise HTTPException(status_code=401, detail="Authentication failed")

    # Verify conversation ownership and get project_id
    try:
        conv_response = supabase.table("conversations").select("project_id").eq("id", conversation_id).eq("user_id", user.id).execute()
        if not conv_response.data:
             raise HTTPException(status_code=404, detail="Conversation not found")
        project_id = conv_response.data[0]["project_id"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            # Instantiate ChatAgent on the fly or get from cache
            # Since history is DB-backed, we can re-instantiate cheaply
            # Note: We might want to cache the VectorStore connection (heavy part)
            
            # Use cached agent if implementation exists for project, otherwise create
            # We key by project_id because VectorStore is per-project
            if project_id not in chat_agents:
                 chat_agents[project_id] = ChatAgent(project_id=project_id) # Base agent for DB connection
            
            # Create a lightweight agent instance just for this conversation
            # OR better: use the cached agent but pass conversation_id context
            # But ChatAgent architecture was updated to accept conversation_id in init
            
            # Let's instantiate a fresh one for now to ensure correct conversation context
            # Optimization: Re-use vector store from cached agent if available
            agent = ChatAgent(project_id=project_id, conversation_id=conversation_id, user_id=user.id)
            
            yield f"data: {json.dumps({'type': 'connected', 'message': 'Connected to chat stream'})}\n\n"
            
            async for event in agent.chat_stream(message):
                event_type = event["type"]
                event_data = event["data"]
                
                sse_message = {
                    "type": event_type,
                    **event_data
                }
                
                yield f"data: {json.dumps(sse_message)}\n\n"
            
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
            
        except Exception as e:
            error_message = str(e).replace('"', '\\"').replace("\n", " ")
            yield f"data: {json.dumps({'type': 'error', 'message': error_message})}\n\n"
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*"
        }
    )

@router.delete("/chat/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    user = Depends(get_current_user)
):
    """Delete a conversation"""
    try:
        supabase = get_supabase_client()
        # RLS will handle permission check, but good to be explicit
        response = supabase.table("conversations").delete().eq("id", conversation_id).eq("user_id", user.id).execute()
        
        return {
            "success": True,
            "message": "Conversation deleted"
        }
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))



# ============================================
# SEARCH ENDPOINTS (PROJECT-BASED)
# ============================================

@router.post("/search")
async def search_documents(request: SearchRequest):
    """Search documents within a specific project"""
    try:
        # chroma_dir check removed
        
        vector_manager = VectorStoreManager(embedding_model=settings.EMBEDDING_MODEL)
        vectorstore = vector_manager.load_vector_store(
            persist_directory=None,
            collection_name=request.project_id
        )
        
        results = vector_manager.search(vectorstore, request.query, k=request.k)
        
        formatted_results = []
        for i, doc in enumerate(results, 1):
            formatted_results.append({
                "rank": i,
                "content": doc.page_content[:500] + "..." if len(doc.page_content) > 500 else doc.page_content,
                "metadata": doc.metadata
            })
        
        return {
            "success": True,
            "project_id": request.project_id,
            "query": request.query,
            "results_count": len(results),
            "results": formatted_results
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# DOCUMENT VIEWING ENDPOINTS (PROJECT-BASED)
# ============================================

@router.get("/projects/{project_id}/documents/{document_id}/chunks")
async def view_processed_chunks(
    project_id: str,
    document_id: str,
    include_images: bool = True
):
    """View processed chunks for a specific document"""
    try:
        import base64
        from pathlib import Path
        
        # Download from Supabase (Primary Source) - No local file check
        storage_mgr = StorageManager()
        supabase_path = f"{project_id}/json/{document_id}_processed.json"
        
        try:
             json_bytes = storage_mgr.download_file(
                 supabase_path, 
                 bucket_name=settings.SUPABASE_DATA_BUCKET_NAME
             )
             chunks_data = json.loads(json_bytes.decode('utf-8'))
             json_file_path = f"supabase://{settings.SUPABASE_DATA_BUCKET_NAME}/{supabase_path}"
        
        except Exception as e:
             # Try fallback path without project_id prefix just in case
             try:
                fallback_path = f"json/{document_id}_processed.json"
                json_bytes = storage_mgr.download_file(
                    fallback_path, 
                    bucket_name=settings.SUPABASE_DATA_BUCKET_NAME
                )
                chunks_data = json.loads(json_bytes.decode('utf-8'))
                json_file_path = f"supabase://{settings.SUPABASE_DATA_BUCKET_NAME}/{fallback_path}"
             except:
                raise HTTPException(
                    status_code=404, 
                    detail=f"Processed chunks not found for document '{document_id}' in Supabase. Ensure processing is complete."
                )
        
        # Process images if requested
        if isinstance(chunks_data, list):
            image_dir = settings.get_project_image_dir(project_id) # Not used for remote files but kept for path logic reference if needed
            
            for chunk in chunks_data:
                # 1. Resolve Text Content
                # New standard: enhanced_content. Legacy: page_content, text.
                primary_text = chunk.get('enhanced_content') or chunk.get('page_content') or chunk.get('text') or ""
                
                # Fallback to metadata if nested (legacy structure)
                if not primary_text and 'metadata' in chunk:
                    primary_text = chunk['metadata'].get('original_text', "")

                # Set ALL fields to ensure frontend finds it
                chunk['text'] = primary_text
                chunk['content'] = primary_text
                chunk['page_content'] = primary_text
                chunk['original_text'] = primary_text # Might overwrite if top-level exists, but primary_text is truth
                
                # 2. Flatten Metadata (if nested) for other fields
                if 'metadata' in chunk and isinstance(chunk['metadata'], dict):
                    for k, v in chunk['metadata'].items():
                        if k not in chunk:
                            chunk[k] = v

                # 3. Process Images
                if include_images:
                    chunk['images_base64'] = []
                    
                    # Try to find base64 data (Top level first, then metadata)
                    embedded_b64 = chunk.get('image_base64')
                    
                    # Handle potential stringified JSON (Qdrant legacy) or list
                    if isinstance(embedded_b64, str):
                        try: embedded_b64 = json.loads(embedded_b64)
                        except: embedded_b64 = []
                        
                    if isinstance(embedded_b64, list) and embedded_b64:
                        # Get paths for reference
                        paths = chunk.get('image_paths', [])
                        if isinstance(paths, str):
                            try: paths = json.loads(paths)
                            except: paths = []
                            
                        for idx, b64_data in enumerate(embedded_b64):
                            path_val = paths[idx] if isinstance(paths, list) and idx < len(paths) else None
                            filename = Path(path_val).name if path_val else f"image_{idx}.png"
                            
                            chunk['images_base64'].append({
                                'filename': filename,
                                'data': f"data:image/png;base64,{b64_data}",
                                'path': path_val
                            })
                    
                    # Fallback: remote/local paths if no base64
                    elif chunk.get('image_paths'):
                        paths = chunk.get('image_paths')
                        if isinstance(paths, str):
                             try: paths = json.loads(paths)
                             except: paths = [paths]
                             
                        if isinstance(paths, list):
                            for image_path in paths:
                                if image_path.startswith("http"):
                                     chunk['images_base64'].append({
                                        'filename': Path(image_path).name,
                                        'data': image_path,
                                        'path': image_path
                                    })
                                else:
                                     chunk['images_base64'].append({
                                        'filename': Path(image_path).name,
                                        'data': image_path, # Assume path IS the url/ref
                                        'path': image_path
                                    })

                        for image_path in chunk['image_paths']:
                            # Check if it's a remote URL (Supabase)
                            if image_path.startswith("http://") or image_path.startswith("https://"):
                                chunk['images_base64'].append({
                                    'filename': Path(image_path).name,
                                    'data': image_path,
                                    'path': image_path
                                })
                                continue

                            # Fallback logic based on path
                            chunk['images_base64'].append({
                                'filename': Path(image_path).name if image_path else 'image',
                                'data': image_path, # Assume path IS the url if not local
                                'path': image_path
                            })
        
        # file_stats = os.stat(json_file_path)
        file_size_kb = len(json_bytes) / 1024
        
        return {
            "success": True,
            "project_id": project_id,
            "document_id": document_id,
            "file_path": json_file_path,
            "file_size_kb": round(file_size_kb, 2),
            "chunks_count": len(chunks_data) if isinstance(chunks_data, list) else 1,
            "images_included": include_images,
            "chunks": chunks_data
        }
    
    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading chunks: {str(e)}")


@router.get("/projects/{project_id}/images/{image_filename}")
async def get_project_image(project_id: str, image_filename: str):
    """Get a specific image from a project"""
    try:
        from pathlib import Path
        
        image_dir = settings.get_project_image_dir(project_id)
        image_path = os.path.join(image_dir, image_filename)
        
        if not os.path.exists(image_path):
            raise HTTPException(
                status_code=404,
                detail=f"Image '{image_filename}' not found in project '{project_id}'"
            )
        
        allowed_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp']
        if Path(image_path).suffix.lower() not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Invalid file type")
        
        return FileResponse(
            path=image_path,
            media_type="image/png" if image_path.endswith('.png') else "image/jpeg",
            filename=image_filename
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving image: {str(e)}")


# ============================================
# UTILITY ENDPOINTS
# ============================================

@router.get("/languages")
async def get_supported_languages():
    """Get list of all supported OCR languages"""
    from core.document_parser import DocumentParser
    
    languages = DocumentParser.get_supported_languages()
    
    return {
        "success": True,
        "count": len(languages),
        "languages": languages,
        "examples": {
            "english": "eng",
            "hindi": "hin",
            "spanish": "spa",
            "chinese": "chi_sim",
            "arabic": "ara"
        }
    }


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


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "data_dir": str(settings.DATA_DIR),
        "api_version": settings.API_VERSION,
        "active_processing": len(processing_status),
        "active_chat_sessions": len(chat_agents),
        "projects_count": len(settings.list_projects())
    }

"""FastAPI routes with project-based data organization"""
import os
import shutil
import json
import asyncio
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, AsyncGenerator
import zipfile
import tempfile

from config.settings import settings
from core.document_parser import DocumentParser
from core.content_processor import ContentProcessor
from core.vector_store import VectorStoreManager
from utils.file_helpers import FileHandler
from core.chat_agent import ChatAgent
from typing import Dict

# Store active chat agents
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
    """Create a new project"""
    try:
        # Sanitize project name
        project_id = request.project_name.replace(" ", "_").replace("/", "_").replace("\\", "_")
        
        # Create project directory structure
        project_dir = settings.get_project_dir(project_id)
        
        if project_dir.exists():
            raise HTTPException(status_code=400, detail=f"Project '{project_id}' already exists")
        
        # Create all subdirectories
        settings.get_project_upload_dir(project_id)
        settings.get_project_image_dir(project_id)
        settings.get_project_pickle_dir(project_id)
        settings.get_project_json_dir(project_id)
        settings.get_project_chroma_dir(project_id)
        
        return {
            "success": True,
            "message": "Project created successfully",
            "project_id": project_id,
            "project_path": str(project_dir)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects")
async def list_projects():
    """List all projects"""
    try:
        projects = settings.list_projects()
        
        return {
            "success": True,
            "count": len(projects),
            "projects": projects
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}")
async def get_project_details(project_id: str):
    """Get detailed information about a project"""
    try:
        project_dir = settings.get_project_dir(project_id)
        
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
        
        # Get file counts
        upload_dir = settings.get_project_upload_dir(project_id)
        image_dir = settings.get_project_image_dir(project_id)
        
        pdf_files = list(upload_dir.glob("*.pdf"))
        image_files = list(image_dir.glob("*"))
        
        # Get vector store info
        chroma_dir = settings.get_project_chroma_dir(project_id)
        
        has_vector_store = (chroma_dir / project_id).exists()
        doc_count = 0
        
        if has_vector_store:
            try:
                vector_manager = VectorStoreManager(embedding_model=settings.EMBEDDING_MODEL)
                vectorstore = vector_manager.load_vector_store(
                    persist_directory=str(chroma_dir),
                    collection_name=project_id
                )
                collection = vectorstore._collection
                doc_count = collection.count()
            except:
                pass
        
        return {
            "success": True,
            "project_id": project_id,
            "project_path": str(project_dir),
            "pdf_files": [{"filename": f.name, "size_mb": round(f.stat().st_size / (1024*1024), 2)} for f in pdf_files],
            "pdf_count": len(pdf_files),
            "image_count": len(image_files),
            "has_vector_store": has_vector_store,
            "chunks_in_db": doc_count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete an entire project and all its data"""
    try:
        project_dir = settings.get_project_dir(project_id)
        
        if not project_dir.exists():
            raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")
        
        # Delete the entire project directory
        shutil.rmtree(project_dir)
        
        return {
            "success": True,
            "message": f"Project '{project_id}' deleted successfully",
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
    Process PDF and add to project (APPENDS data, does not delete existing)
    """
    try:
        # Verify project exists
        project_dir = settings.get_project_dir(project_id)
        if not project_dir.exists():
            raise HTTPException(
                status_code=404, 
                detail=f"Project '{project_id}' not found. Create it first using POST /api/projects"
            )
        
        # Generate unique document ID
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        document_id = f"{file.filename.replace('.pdf', '')}_{timestamp}"
        
        # Save uploaded file to project's upload directory
        upload_dir = settings.get_project_upload_dir(project_id)
        upload_path = os.path.join(upload_dir, f"{document_id}.pdf")
        
        with open(upload_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Validate PDF
        is_valid, error_msg = FileHandler.validate_pdf(
            upload_path, 
            settings.MAX_FILE_SIZE // (1024 * 1024)
        )
        if not is_valid:
            os.remove(upload_path)
            raise HTTPException(status_code=400, detail=error_msg)
        
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
        # Get project-specific directories
        image_dir = settings.get_project_image_dir(project_id)
        pickle_dir = settings.get_project_pickle_dir(project_id)
        json_dir = settings.get_project_json_dir(project_id)
        chroma_dir = settings.get_project_chroma_dir(project_id)
        
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
        parser = DocumentParser(image_output_dir=str(image_dir))
        
        loop = asyncio.get_event_loop()
        elements = await loop.run_in_executor(
            None,
            parser.partition_pdf_document,
            upload_path,
            max_characters,
            new_after_n_chars,
            combine_text_under_n_chars,
            extract_images,
            extract_tables,
            language_list
        )
        
        checkpoint1_path = os.path.join(pickle_dir, f"{document_id}_checkpoint1.pkl")
        FileHandler.save_pickle(elements, checkpoint1_path)
        
        processing_status[document_id] = {
            "status": "processing",
            "step": 2,
            "step_name": "parsing",
            "progress": 30,
            "message": f"Extracted {len(elements)} elements",
            "elements_count": len(elements),
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
            temperature=settings.TEMPERATURE
        )
        
        documents = await loop.run_in_executor(
            None,
            processor.summarise_chunks,
            elements
        )
        
        image_count = len(list(image_dir.glob("*.png")))
        
        output_pickle_path = os.path.join(pickle_dir, f"{document_id}_processed.pkl")
        output_json_path = os.path.join(json_dir, f"{document_id}_processed.json")
        
        FileHandler.save_pickle(documents, output_pickle_path)
        FileHandler.save_json(documents, output_json_path)
        
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
            "message": "Step 4: Adding to vector database...",
            "project_id": project_id
        }
        
        vector_manager = VectorStoreManager(embedding_model=settings.EMBEDDING_MODEL)
        
        # Use append_to_vector_store instead of create_vector_store
        vectorstore = await loop.run_in_executor(
            None,
            vector_manager.append_to_vector_store,
            documents,
            str(chroma_dir),
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

@router.post("/chat/init/{project_id}")
async def initialize_chat(project_id: str):
    """Initialize chat session for a project"""
    try:
        # Check if project exists
        chroma_dir = settings.get_project_chroma_dir(project_id)
        if not (chroma_dir / project_id).exists():
            raise HTTPException(
                status_code=404, 
                detail=f"Project '{project_id}' not found or has no processed documents"
            )
        
        # Create chat agent with project-specific paths
        chat_agent = ChatAgent(
            project_id=project_id,
            chroma_dir=str(chroma_dir),
            image_dir=str(settings.get_project_image_dir(project_id))
        )
        session_id = f"{project_id}_{len(chat_agents)}"
        chat_agents[session_id] = chat_agent
        
        return {
            "success": True,
            "session_id": session_id,
            "project_id": project_id,
            "message": "Chat session initialized successfully"
        }
    
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chat/stream/{session_id}")
async def chat_stream(session_id: str, message: str):
    """Stream chat responses via SSE"""
    
    if session_id not in chat_agents:
        raise HTTPException(
            status_code=404,
            detail="Chat session not found. Initialize chat first using /chat/init/{project_id}"
        )
    
    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            chat_agent = chat_agents[session_id]
            
            yield f"data: {json.dumps({'type': 'connected', 'message': 'Connected to chat stream'})}\n\n"
            
            async for event in chat_agent.chat_stream(message):
                event_type = event["type"]
                event_data = event["data"]
                
                sse_message = {
                    "type": event_type,
                    **event_data
                }
                
                yield f"data: {json.dumps(sse_message)}\n\n"
            
            yield f"data: {json.dumps({'type': 'end'})}\n\n"
            
        except asyncio.CancelledError:
            pass
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


@router.post("/chat/clear/{session_id}")
async def clear_chat_history(session_id: str):
    """Clear conversation history for a chat session"""
    if session_id not in chat_agents:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    try:
        chat_agents[session_id].clear_history()
        return {
            "success": True,
            "message": "Chat history cleared successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/chat/session/{session_id}")
async def delete_chat_session(session_id: str):
    """Delete a chat session"""
    if session_id not in chat_agents:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    try:
        del chat_agents[session_id]
        return {
            "success": True,
            "message": "Chat session deleted successfully"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chat/sessions")
async def list_chat_sessions():
    """List all active chat sessions"""
    sessions = [
        {
            "session_id": session_id,
            "project_id": agent.project_id,
            "history_length": len(agent.conversation_history)
        }
        for session_id, agent in chat_agents.items()
    ]
    
    return {
        "success": True,
        "count": len(sessions),
        "sessions": sessions
    }


# ============================================
# SEARCH ENDPOINTS (PROJECT-BASED)
# ============================================

@router.post("/search")
async def search_documents(request: SearchRequest):
    """Search documents within a specific project"""
    try:
        chroma_dir = settings.get_project_chroma_dir(request.project_id)
        
        if not (chroma_dir / request.project_id).exists():
            raise HTTPException(
                status_code=404, 
                detail=f"Project '{request.project_id}' not found or has no processed documents"
            )
        
        vector_manager = VectorStoreManager(embedding_model=settings.EMBEDDING_MODEL)
        vectorstore = vector_manager.load_vector_store(
            persist_directory=str(chroma_dir),
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
        
        json_dir = settings.get_project_json_dir(project_id)
        json_file_path = os.path.join(json_dir, f"{document_id}_processed.json")
        
        if not os.path.exists(json_file_path):
            raise HTTPException(
                status_code=404, 
                detail=f"Processed chunks not found for document '{document_id}' in project '{project_id}'"
            )
        
        with open(json_file_path, 'r', encoding='utf-8') as f:
            chunks_data = json.load(f)
        
        # Process images if requested
        if include_images and isinstance(chunks_data, list):
            image_dir = settings.get_project_image_dir(project_id)
            
            for chunk in chunks_data:
                if 'image_paths' in chunk and chunk['image_paths']:
                    chunk['images_base64'] = []
                    
                    for image_path in chunk['image_paths']:
                        full_image_path = os.path.join(image_dir, Path(image_path).name)
                        
                        try:
                            if os.path.exists(full_image_path):
                                with open(full_image_path, 'rb') as img_file:
                                    image_data = img_file.read()
                                    base64_image = base64.b64encode(image_data).decode('utf-8')
                                    
                                    ext = Path(full_image_path).suffix.lower()
                                    mime_type = 'image/png' if ext == '.png' else 'image/jpeg'
                                    
                                    chunk['images_base64'].append({
                                        'filename': Path(image_path).name,
                                        'data': f"data:{mime_type};base64,{base64_image}",
                                        'path': image_path
                                    })
                            else:
                                chunk['images_base64'].append({
                                    'filename': Path(image_path).name,
                                    'error': 'Image file not found',
                                    'path': image_path
                                })
                        except Exception as img_error:
                            chunk['images_base64'].append({
                                'filename': Path(image_path).name,
                                'error': str(img_error),
                                'path': image_path
                            })
        
        file_stats = os.stat(json_file_path)
        file_size_kb = file_stats.st_size / 1024
        
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

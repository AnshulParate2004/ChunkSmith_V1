"""Document processing and viewing API routes"""
import os
import json
import asyncio
import tempfile
import shutil
import zipfile
from datetime import datetime
from typing import AsyncGenerator, Dict
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Query, Depends
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, Response
from config.settings import settings
from core.document_parser import DocumentParser
from core.content_processor import ContentProcessor
from utils.file_helpers import FileHandler
from utils.storage import StorageManager
from utils.vector_store import VectorStoreManager
from api.shared import processing_status, send_sse_message
from api.auth_routes import get_current_user, get_supabase_client
from utils.project_repository import ProjectRepository

router = APIRouter(tags=["Document Processing"])


@router.get("/documents")
async def download_document(
    document_id: str = Query(...),
    project_id: str = Query(...),
    user = Depends(get_current_user)
):
    """Download specific document processing results as ZIP with images"""
    try:
        storage_mgr = StorageManager()
        
        # 1. Fetch JSON Data
        json_path = f"{project_id}/json/{document_id}_processed.json"
        try:
            json_bytes = storage_mgr.download_file(json_path, settings.SUPABASE_DATA_BUCKET_NAME)
        except Exception:
             try:
                 json_path = f"json/{document_id}_processed.json"
                 json_bytes = storage_mgr.download_file(json_path, settings.SUPABASE_DATA_BUCKET_NAME)
             except:
                 raise HTTPException(status_code=404, detail="Document data not found")

        # 2. Parse JSON to find associated images
        try:
            data = json.loads(json_bytes.decode('utf-8'))
            image_filenames = set()
            
            # Helper to extract paths
            def extract_from_chunk(chunk):
                # Check image_paths list
                if 'image_paths' in chunk:
                    paths = chunk['image_paths']
                    if isinstance(paths, str):
                        try: paths = json.loads(paths)
                        except: paths = []
                    if isinstance(paths, list):
                        for p in paths:
                            if p:
                                image_filenames.add(Path(p).name)
                
                # Check metadata (legacy)
                if 'metadata' in chunk:
                    meta = chunk['metadata']
                    if 'image_paths' in meta:
                        paths = meta['image_paths']
                        if isinstance(paths, str):
                            try: paths = json.loads(paths)
                            except: paths = []
                        if isinstance(paths, list):
                            for p in paths:
                                if p:
                                    image_filenames.add(Path(p).name)

            if isinstance(data, list):
                for chunk in data:
                    extract_from_chunk(chunk)
            elif isinstance(data, dict):
                 # Handle single object wrap if ever used
                 extract_from_chunk(data)
                 
        except Exception as e:
            print(f"Error parsing JSON for images: {e}")
            image_filenames = set()

        # 3. Create ZIP with structure
        temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add JSON to json/ folder
            zipf.writestr(f"json/{document_id}.json", json_bytes)
            
            # Add Images to images/ folder
            if image_filenames:
                for img_name in image_filenames:
                    try:
                        # Try to download image from project images bucket
                        # Path: {project_id}/images/{img_name}
                        img_path = f"{project_id}/images/{img_name}"
                        img_bytes = storage_mgr.download_file(img_path, settings.SUPABASE_BUCKET_NAME) # images bucket
                        zipf.writestr(f"images/{img_name}", img_bytes)
                    except Exception as e:
                        print(f"Could not download image {img_name}: {e}")
                        # Continue without this image
            
        return FileResponse(
            path=temp_zip.name,
            filename=f"{document_id}_package.zip",
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={document_id}_package.zip"}
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# PDF PROCESSING ENDPOINTS
# ============================================

@router.post("/process-pdf")
async def initiate_pdf_processing(
    project_id: str = Query(..., description="Project ID where this PDF belongs"),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    user = Depends(get_current_user),
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

        # Upsert project + document in PostgreSQL (queued)
        file_size_mb = os.path.getsize(upload_path) / (1024 * 1024)
        try:
            supabase = get_supabase_client()
            repo = ProjectRepository(supabase)
            user_id = str(user.id) if hasattr(user, "id") else None
            # Ensure project exists and belongs to current user
            repo.create_project(project_id, user_id=user_id)
            pdf_path = f"{project_id}/{document_id}.pdf"
            repo.upsert_document(
                document_id=document_id,
                project_id=project_id,
                filename=file.filename or f"{document_id}.pdf",
                status="queued",
                pdf_path=pdf_path,
                size_mb=file_size_mb,
            )
        except ValueError as ownership_err:
            # Project exists but belongs to a different user
            print(f"Project ownership error: {ownership_err}")
            raise HTTPException(status_code=403, detail=str(ownership_err))
        except Exception as db_err:
            print(f"DB upsert (queued) failed: {db_err}")
        
        # Start background processing
        background_tasks.add_task(
            process_pdf_background,
            project_id=project_id,
            document_id=document_id,
            upload_path=upload_path,
            original_filename=file.filename or f"{document_id}.pdf",
            file_size_mb=file_size_mb,
            max_characters=max_characters,
            new_after_n_chars=new_after_n_chars,
            combine_text_under_n_chars=combine_text_under_n_chars,
            extract_images=extract_images,
            extract_tables=extract_tables,
            languages=languages
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
        if 'upload_path' in locals() and os.path.exists(upload_path):
            os.remove(upload_path)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/process-pdf-stream/{document_id}")
async def stream_pdf_processing(document_id: str, user = Depends(get_current_user)): 
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


# ============================================
# DOCUMENT VIEWING ENDPOINTS
# ============================================

@router.get("/projects/{project_id}/documents/{document_id}/chunks")
async def view_processed_chunks(
    project_id: str,
    document_id: str,
    include_images: bool = True,
    user = Depends(get_current_user)
):
    """View processed chunks for a specific document"""
    # Check current processing status first
    if document_id in processing_status:
        status_info = processing_status[document_id]
        if status_info.get("status") not in ["completed", "failed"]:
             return JSONResponse(
                status_code=202,
                content={
                    "success": False,
                    "status": "processing", 
                    "message": "Document processing in progress",
                    "progress": status_info.get("progress", 0),
                    "current_step": status_info.get("message", "Processing...")
                }
            )

    try:
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
            # image_dir = settings.get_project_image_dir(project_id) # Not used for remote files but kept for path logic reference if needed
            
            for chunk in chunks_data:
                # 1. Resolve Text Content
                # We want the frontend to show ONLY the original raw text,
                # not the combined QUESTIONS/SUMMARY/... string.

                # Prefer explicit original_text (top-level or inside metadata)
                raw_original = chunk.get("original_text")
                if not raw_original and isinstance(chunk.get("metadata"), dict):
                    raw_original = chunk["metadata"].get("original_text")

                # If no explicit original text is available, fall back to previous fields
                primary_text = raw_original or chunk.get("enhanced_content") or chunk.get("page_content") or chunk.get("text") or ""

                # Set ALL fields to ensure frontend finds it
                chunk["text"] = primary_text
                chunk["content"] = primary_text
                chunk["page_content"] = primary_text
                # Keep original_text as the true original when we have it
                chunk["original_text"] = raw_original or primary_text
                
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
                        
                        # Legacy handling for string paths
                        elif isinstance(chunk.get('image_paths'), str):
                             # Should have been handled above, but just in case
                             pass

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
async def get_project_image(project_id: str, image_filename: str, user = Depends(get_current_user)):
    """
    Get a specific image from a project.

    NOTE: Images are stored in the Supabase `chunk_images` bucket under:
      {project_id}/images/{image_filename}
    """
    try:
        from io import BytesIO
        from pathlib import Path

        # Validate extension
        allowed_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp']
        if Path(image_filename).suffix.lower() not in allowed_extensions:
            raise HTTPException(status_code=400, detail="Invalid file type")

        storage_mgr = StorageManager()
        storage_path = f"{project_id}/images/{image_filename}"

        try:
            img_bytes = storage_mgr.download_file(storage_path, settings.SUPABASE_BUCKET_NAME)
        except Exception:
            raise HTTPException(
                status_code=404,
                detail=f"Image '{image_filename}' not found for project '{project_id}'"
            )

        # Infer MIME type from extension
        ext = Path(image_filename).suffix.lower()
        if ext == '.png':
            media_type = "image/png"
        elif ext in ['.jpg', '.jpeg']:
            media_type = "image/jpeg"
        elif ext == '.gif':
            media_type = "image/gif"
        elif ext == '.bmp':
            media_type = "image/bmp"
        else:
            media_type = "application/octet-stream"

        return Response(
            content=img_bytes,
            media_type=media_type,
            headers={"Content-Disposition": f'inline; filename="{image_filename}"'}
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving image: {str(e)}")


# ============================================
# BACKGROUND TASK
# ============================================

async def process_pdf_background(
    project_id: str,
    document_id: str,
    upload_path: str,
    max_characters: int,
    new_after_n_chars: int,
    combine_text_under_n_chars: int,
    extract_images: bool,
    extract_tables: bool,
    languages: str,
    original_filename: str = "",
    file_size_mb: float = 0.0,
):
    """Background task for PDF processing with project-based storage"""
    
    def _upsert_doc(status: str, **kwargs):
        try:
            supabase = get_supabase_client()
            repo = ProjectRepository(supabase)
            repo.upsert_document(
                document_id=document_id,
                project_id=project_id,
                filename=original_filename or f"{document_id}.pdf",
                status=status,
                size_mb=file_size_mb,
                **kwargs
            )
        except Exception as e:
            print(f"DB upsert ({status}) failed: {e}")
    
    try:
        _upsert_doc("processing")
        
        # Create a temporary workspace for this task to ensure no local artifacts remain
        temp_dir = tempfile.mkdtemp()
        image_dir = Path(temp_dir) / "images"
        pickle_dir = Path(temp_dir) / "pickle"
        json_dir = Path(temp_dir) / "json"
        
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
            "message": f"Step 2: Parsing complete ({len(elements)} elements)",
            "project_id": project_id
        }
    
        # Step 3: Chunking
        processing_status[document_id].update({
            "step": 3,
            "step_name": "chunking",
            "progress": 30,
            "message": "Step 3: Chunking elements by title..."
        })
        
        from unstructured.chunking.title import chunk_by_title
        
        print(f"\n=== [CHUNKING START] Document: {document_id} ===")
        print(f"Input: {len(elements)} elements to be chunked.")
        
        chunks = chunk_by_title(
            elements=elements,
            max_characters=max_characters,
            new_after_n_chars=new_after_n_chars,
            combine_text_under_n_chars=combine_text_under_n_chars
        )
        
        print(f"Output: Generated {len(chunks)} chunks.")
        for i, chunk in enumerate(chunks):
             # Try to get text content safely
             text_content = getattr(chunk, "text", str(chunk))
             preview = text_content[:60].replace('\n', ' ')
             print(f"  > Chunk {i+1}: Length={len(text_content)} | Content: {preview}...")
        print(f"=== [CHUNKING END] ===\n")
        
        checkpoint2_path = os.path.join(pickle_dir, f"{document_id}_checkpoint2.pkl")
        FileHandler.save_pickle(chunks, checkpoint2_path)
        
        processing_status[document_id].update({
            "progress": 40,
            "message": f"Step 3: Chunking complete ({len(chunks)} chunks)"
        })
        
        # Step 4: AI Summarization
        # Use existing image dir but keep in mind paths will be relative to temp_dir
        # We need to ensure ContentProcessor handles paths correctly for Supabase upload
        processor = ContentProcessor(
            image_dir=str(image_dir), 
            model_name=settings.AZURE_OPENAI_CHAT_MODEL, 
            temperature=settings.TEMPERATURE,
            project_id=project_id
        )
        
        # We will stream progress updates during summarization if possible
        # For now, we update status before starting
        processing_status[document_id].update({
            "step": 4,
            "step_name": "summarizing",
            "progress": 50,
            "message": "Step 4: Generative AI Summarization (Multi-threaded & Multi-Key)..."
        })
        
        langchain_documents = await processor.summarise_chunks(chunks)
        
        # Save processed chunks locally first (JSON)
        processed_data = []
        for doc in langchain_documents:
            doc_dict = {
                "page_content": doc.page_content,
                "metadata": doc.metadata
            }
            # Add enhanced fields to top level for frontend convenience
            doc_dict["enhanced_content"] = doc.page_content 
            doc_dict["original_text"] = doc.metadata.get("original_text", "")
            
            # Flatten some metadata
            for key in ["ai_summary", "ai_questions", "image_interpretation", "table_interpretation"]:
                if key in doc.metadata:
                    doc_dict[key] = doc.metadata[key]
            
            processed_data.append(doc_dict)
        
        json_path = os.path.join(json_dir, f"{document_id}_processed.json")
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(processed_data, f, indent=4, ensure_ascii=False)
        
        processing_status[document_id].update({
            "progress": 80,
            "message": "Step 4: Summarization complete"
        })
        
        # Step 5: Vector Loading
        processing_status[document_id].update({
            "step": 5,
            "step_name": "embedding",
            "progress": 85,
            "message": f"Step 5: Loading {len(langchain_documents)} chunks into Vector Store ({project_id})..."
        })
        
        vector_manager = VectorStoreManager(embedding_model=settings.AZURE_OPENAI_EMBEDDING_MODEL)
        
        # Add to project-specific collection
        vector_manager.create_vector_store(
            documents=langchain_documents,
            collection_name=project_id 
        )
        
        processing_status[document_id].update({
            "progress": 95,
            "message": "Step 5: Vector loading complete"
        })
        
        # Step 6: Upload artifacts to Supabase
        storage_mgr = StorageManager()
        
        # Upload JSON
        with open(json_path, 'rb') as f:
            storage_mgr.upload_data(
                f.read(),
                f"{project_id}/json/{document_id}_processed.json",
                "application/json",
                bucket_name=settings.SUPABASE_DATA_BUCKET_NAME
            )
        
        # Upload Pickles (Checkpoints)
        with open(checkpoint1_path, 'rb') as f:
             storage_mgr.upload_data(
                f.read(),
                f"{project_id}/pickle/{document_id}_checkpoint1.pkl",
                "application/octet-stream",
                bucket_name=settings.SUPABASE_PKL_BUCKET_NAME
            )
        
        with open(checkpoint2_path, 'rb') as f:
             storage_mgr.upload_data(
                f.read(),
                f"{project_id}/pickle/{document_id}_checkpoint2.pkl",
                "application/octet-stream",
                bucket_name=settings.SUPABASE_PKL_BUCKET_NAME
            )

        # Cleanup local processed file (temp uploaded)
        if os.path.exists(upload_path):
             os.remove(upload_path)
             
        # Cleanup temporary workspace
        shutil.rmtree(temp_dir)
        
        # Upsert completed in PostgreSQL
        image_count = processor.image_counter if hasattr(processor, 'image_counter') else 0
        _upsert_doc(
            "completed",
            pdf_path=f"{project_id}/{document_id}.pdf",
            json_path=f"{project_id}/json/{document_id}_processed.json",
            image_count=image_count,
            chunk_count=len(chunks),
        )
        
        # Complete
        processing_status[document_id] = {
            "status": "completed",
            "progress": 100,
            "message": "Processing successfully completed!",
            "project_id": project_id,
            "document_id": document_id,
            "stats": {
                "chunks": len(chunks),
                "images": image_count
            }
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        
        try:
            supabase = get_supabase_client()
            repo = ProjectRepository(supabase)
            repo.upsert_document(
                document_id=document_id,
                project_id=project_id,
                filename=original_filename or f"{document_id}.pdf",
                status="failed",
            )
        except Exception as db_err:
            print(f"DB upsert (failed) error: {db_err}")
        
        try:
            if 'upload_path' in locals() and os.path.exists(upload_path):
                os.remove(upload_path)
            if 'temp_dir' in locals() and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
        except:
            pass
            
        processing_status[document_id] = {
            "status": "failed",
            "progress": 0,
            "message": f"Processing failed: {str(e)}",
            "error_details": str(e),
            "project_id": project_id
        }

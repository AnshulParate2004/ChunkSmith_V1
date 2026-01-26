"""Shared dependencies, models, state, and simple routes for API"""
from datetime import datetime
from typing import Dict, Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from core.chat_agent import ChatAgent
from config.settings import settings
from utils.vector_store import VectorStoreManager
import json

# Create router for simple routes
router = APIRouter(tags=["Search"])

# ============================================
# SHARED STATE
# ============================================

# Store active chat agents (Project Level Cache)
# Key: project_id
chat_agents: Dict[str, ChatAgent] = {}

# Store processing status for each document
processing_status = {}


# ============================================
# SHARED REQUEST MODELS
# ============================================

class ProcessRequest(BaseModel):
    """Request model for document processing"""
    project_id: str
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
    project_id: str
    k: Optional[int] = 5


# ============================================
# SHARED HELPER FUNCTIONS
# ============================================

async def send_sse_message(message_type: str, data: dict) -> str:
    """Format SSE message"""
    message = {
        "type": message_type,
        "data": data,
        "timestamp": datetime.now().isoformat()
    }
    return f"data: {json.dumps(message)}\n\n"


# ============================================
# SEARCH ROUTE (Simple, kept with shared models)
# ============================================

@router.post("/search")
async def search_documents(request: SearchRequest):
    """Search documents within a specific project"""
    try:
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

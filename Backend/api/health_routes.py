"""Health check and utility API routes"""
from fastapi import APIRouter
from config.settings import settings
from core.document_parser import DocumentParser
from api.shared import processing_status, chat_agents

router = APIRouter(tags=["System"])


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


@router.get("/languages")
async def get_supported_languages():
    """Get list of all supported OCR languages"""
    
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

"""
FastAPI Main Application
Run with: uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router
from config.settings import settings
from dotenv import load_dotenv
import pytesseract
import platform
import os

# -------------------------------
# Configure Tesseract Path (Windows / Docker Linux)
# -------------------------------
if platform.system() == "Windows":
    # Windows local machine
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
else:
    # Docker/Linux: tesseract installed at /usr/bin/tesseract
    pytesseract.pytesseract.tesseract_cmd = "tesseract"

# -------------------------------
# Load .env (works on Windows, Linux, Docker)
# -------------------------------
load_dotenv()

# -------------------------------
# Cleanup Function for Marked Deletions
# -------------------------------
def cleanup_marked_projects():
    """Delete projects that were marked for deletion"""
    import shutil
    data_dir = settings.DATA_DIR
    if not data_dir.exists():
        return
    
    deleted_count = 0
    for project_dir in data_dir.iterdir():
        if project_dir.is_dir():
            marker_file = project_dir / ".DELETE_ON_STARTUP"
            if marker_file.exists():
                try:
                    print(f"🗑️  Cleaning up marked project: {project_dir.name}")
                    shutil.rmtree(project_dir)
                    deleted_count += 1
                    print(f"  ✓ Deleted: {project_dir.name}")
                except Exception as e:
                    print(f"  ✗ Could not delete {project_dir.name}: {e}")
    
    if deleted_count > 0:
        print(f"✓ Startup cleanup: Removed {deleted_count} marked project(s)")

# -------------------------------
# Initialize FastAPI App
# -------------------------------
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="Multimodal RAG API for PDF processing with AI-enhanced summaries and vector search"
)

# Run cleanup on startup
@app.on_event("startup")
async def startup_event():
    """Run cleanup tasks on startup"""
    cleanup_marked_projects()

# -------------------------------
# CORS Middleware
# -------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------
# Include API Routes
# -------------------------------
app.include_router(router, prefix="/api", tags=["documents"])

# -------------------------------
# Root Endpoint
# -------------------------------
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to MultiModal RAG API",
        "version": settings.API_VERSION,
        "docs": "/docs",
        "endpoints": {
            "process_pdf": "/api/process-pdf",
            "search": "/api/search",
            "list_documents": "/api/documents",
            "health": "/api/health"
        }
    }

# -------------------------------
# Local Run
# -------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

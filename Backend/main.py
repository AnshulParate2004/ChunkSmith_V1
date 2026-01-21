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
# Initialize FastAPI App
# -------------------------------
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="Multimodal RAG API for PDF processing with AI-enhanced summaries and vector search"
)

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

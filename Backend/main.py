from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from api.routes import router
from config.settings import settings
from config.logging_config import configure_logging
from utils.health_monitor import health_monitor_loop
from dotenv import load_dotenv
import platform
import os
import asyncio
import logging

# Configure logging (suppress verbose retry logs)
configure_logging()




# -------------------------------
# Load .env (works on Windows, Linux, Docker)
# -------------------------------
load_dotenv()

# -------------------------------
# Lifespan Event Handlers
# -------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events"""
    # Startup
    asyncio.create_task(health_monitor_loop())
    yield
    # Shutdown (if needed in future)

# -------------------------------
# Initialize FastAPI App
# -------------------------------
app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description="Multimodal RAG API for PDF processing with AI-enhanced summaries and vector search",
    lifespan=lifespan
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

app.include_router(router, prefix="/api", tags=["documents"])

# Conversation routes are now included in api.routes

# -------------------------------
# Simple request logging middleware
# -------------------------------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming HTTP requests and their responses."""

    response = await call_next(request)

    return response

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
    # Disable reload so request logs and prints appear in this same process/terminal
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)

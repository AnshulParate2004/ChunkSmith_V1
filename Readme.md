# ChunkSmith

**Multimodal RAG System with Image Extraction & Retrieval**

Extract, process, and chat with PDF documents while preserving actual images from source files.

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://hub.docker.com/r/anshulnp/chunksmith-app)

---

## Resources

- **Live Demo**: [https://multi-modul-rag.vercel.app/](https://multi-modul-rag.vercel.app/)
- **Docker Hub**: [https://hub.docker.com/r/anshulnp/chunksmith-app](https://hub.docker.com/r/anshulnp/chunksmith-app)
- **Demo Video**:
  
  [![ChunkSmith Demo](https://img.youtube.com/vi/a9Haiu-e7ZU/maxresdefault.jpg)](https://www.youtube.com/watch?v=a9Haiu-e7ZU)

## Overview

ChunkSmith is a powerful multimodal RAG (Retrieval-Augmented Generation) system that enables intelligent document processing and chat capabilities. It extracts text, images, and tables from PDFs, processes them using advanced AI models, and provides context-aware responses with visual support.

### Key Capabilities

Unlike traditional RAG systems that often discard visual information, ChunkSmith:
- **Preserves Original Images**: Returns actual images from PDFs in responses alongside text.
- **Extracts Tables**: Maintains structure and relationships within tabular data.
- **Multi-language Support**: Processes documents in 90+ languages using Tesseract OCR.
- **Scalable Architecture**: Uses async processing and load balancing for high throughput.
- **Intelligent Responses**: Provides context-aware answers combining text and visual context.

---

## Quick Start

### Run Locally with Docker (Recommended)

The easiest way to run ChunkSmith is using the provided Docker scripts.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Start-to-End-AI-Project/ChunkSmith.git
    cd ChunkSmith
    ```

2.  **Run the application:**
    Windows users can use the provided batch script:
    ```bash
    run-app.bat
    ```
    
    Or using Docker Compose directly:
    ```bash
    docker-compose up -d
    ```

3.  **Access the application:**
    - Frontend: `http://localhost`
    - Backend API: `http://localhost:8000`
    - API Documentation: `http://localhost:8000/docs`

---

## Features

- **Image Retrieval**: Returns actual images from PDFs in responses.
- **Multi-language OCR**: Support for 90+ languages.
- **Async Processing**: Multi-API key load balancing for high throughput.
- **Smart Chat**: Context-aware Q&A with visual and textual support.
- **Data Export**: Download chunks, images, and embeddings.
- **Streaming Responses**: Real-time Server-Sent Events (SSE) for chat.
- **Data Persistence**: Vector storage and metadata management.

---

## Architecture

```
ChunkSmith/
├── Backend/                 # FastAPI Application
│   ├── main.py              # Entry point
│   ├── api/                 # API Routes
│   ├── core/                # Core logic (PDF parsing, RAG, AI)
│   └── Dockerfile           # Backend container config
├── Frontend/                # React Application
│   ├── src/                 # Source code
│   └── Dockerfile           # Frontend container config
├── docker-compose.yml       # Orchestration
└── run-app.bat              # Startup script
```

---

## Tech Stack

**Backend**
- FastAPI
- Google Gemini 2.5 Pro
- LangChain
- ChromaDB
- Tesseract OCR
- PyMuPDF

**Frontend**
- React 18
- TypeScript
- TailwindCSS
- Vite

**Infrastructure**
- Docker & Docker Compose
- Nginx (Frontend serving)

---

## API Documentation

When the backend is running, full interactive API documentation is available at `http://localhost:8000/docs`.

**Core Endpoints:**

- `POST /api/process-pdf`: Upload and process PDF documents.
- `GET /api/process-pdf-stream/{doc_id}`: Real-time processing progress.
- `POST /api/chat/init/{doc_id}`: Initialize chat session.
- `GET /api/chat/stream/{session_id}`: Stream chat responses.
- `POST /api/search`: Semantic search across documents.

---

## License

MIT License.

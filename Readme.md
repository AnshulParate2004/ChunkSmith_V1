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

## How It Works

### 1. Upload PDF
User uploads any PDF file to the system.

### 2. OCR + Chunking
The PDF is broken into smaller chunks using **Yolov11**, **Tesseract OCR** & **Poppler**.

### 3. Chunk Format
Each chunk contains **Text**, **Snapshot**, **Summary**, and **Metadata**.

### 4. AI Summarization
Each chunk image is passed to the AI to generate a high-quality summary.

### 5. Vector Embedding
Summaries + text are converted into vector embeddings for semantic search.

### 6. Ask Questions
Users can ask any question about the PDF. The AI retrieves relevant chunks.

### 7. Return Answer + Image
The AI answers and returns the exact image snippet for proof.

---

## License

This project is licensed under the **MIT License**.

Copyright (c) 2024 Anshul Parate

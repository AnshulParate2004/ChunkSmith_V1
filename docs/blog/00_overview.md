# ChunkSmith: Intelligent Document Processing & RAG Engine

## Project Overview
ChunkSmith is an advanced document processing system designed to unlock the value of unstructured data in PDF documents. Unlike traditional RAG (Retrieval-Augmented Generation) systems that simply chunk text, ChunkSmith employs a multi-modal approach to extract, understand, and index complex content including text, images, and tables.

## Key Features

### 1. Multi-Modal Extraction
The system doesn't just read text. It uses **Unstructured.io** to intelligently partition PDFs, separating:
- **Text Blocks**: Standard textual content.
- **Tables**: Preserved as HTML to maintain structure.
- **Images**: Extracted, saved, and analyzed separately.

### 2. AI-Enhanced Content Understanding
Raw chunks are not enough. ChunkSmith uses **Google Gemini 2.5 Pro** to "read" every chunk before indexing.
- **Image Summarization**: Instead of expensive multi-modal embedding of every image, the system generates detailed text descriptions and interpretations of images. This allows visual content to be retrieved via text queries, significantly reducing tokens and cost while maintaining high accuracy.
- **Question Generation**: The AI anticipates what users might ask about a specific chunk and generates a list of potential questions. These are indexed alongside the content, boosting semantic retrieval.
- **Content Summarization**: A concise summary is generated for every chunk to improve search relevance.

### 3. Vector Database with Low-Dimensional Efficiency
Processed chunks—enriched with AI summaries, questions, and image descriptions—are stored in **Qdrant**, a high-performance vector database.
- **Efficient Retrieval**: By converting visual information into descriptive text, we can use efficient text embeddings (Google Generative AI Embeddings) to retrieve "visual" answers without the latency or cost of pure vision models at inference time.
- **Scalability**: The system is designed to handle large documents by processing chunks asynchronously using a pool of API keys.

### 4. Smart Retrieval (RAG)
The Chat Agent doesn't just dump text. It:
- **Reconstructs Context**: Pulls relevant text, table HTML, and image descriptions.
- **Visual References**: Can "see" images via their descriptions and serve the actual image files to the user when relevant.
- **Citations**: Provides page numbers and source attribution.

## Architecture Highlights
- **Backend**: Python (FastAPI equivalent routes), LangChain, Unstructured Client.
- **AI Model**: Gemini 2.5 Pro (for generation), Gemini Embedding 001 (for vectors).
- **Database**: Qdrant (Vector Store), Supabase (Chat History & Image Storage).
- **Processing**: Asyncio for high-concurrency document processing.

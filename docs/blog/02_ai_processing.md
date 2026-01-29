# AI Processing: Turning Chunks into Intelligence

Extraction is just the first step. The raw chunks are often fragmented or lack context. ChunkSmith uses a dedicated `ContentProcessor` to enrich every piece of data before it hits the database.

## The `ContentProcessor` (`Backend/core/content_processor.py`)

This is the brain of the ingestion system. It employs an asynchronous, multi-key architecture to process documents rapidly.

### 1. Content Separation
Before sending data to the AI, the processor separates the messy stream of elements into a structured format:
```python
content_data = {
    'text': "...",            # Combined narrative text
    'tables': ["<table>..."], # Preserved HTML tables
    'image_base64': [...],    # Raw image data for analysis
    'images_dirpath': [...]   # Public URLs after Supabase upload
}
```
*Note: Images are uploaded to Supabase Storage immediately so we have permanent links to serve to the frontend later.*

### 2. The "Intelligence" Prompt
This is the secret sauce. We don't just embed the text. We ask Gemini 2.5 Pro to "analyze" the chunk using a structured prompt.

**The Goal:** Make the content "Findable".

**The Prompt Strategy:**
> "You are creating a searchable description for document content retrieval."

We ask the AI to generate a structured object (`AIParser` Pydantic model) containing:

#### A. Question Generation (`question` field)
*   **Why?** Users often search by asking questions (e.g., "What is the revenue growth?").
*   **How?** The AI generates: "List all potential questions that can be answered from this content."
*   **Benefit:** If the user asks a question similar to one generated, the semantic similarity is extremely high, guaranteeing a hit in the vector database.

#### B. Image Interpretation (`image_interpretation` field)
*   **The Problem:** Storing image embeddings is expensive and high-dimensional.
*   **The Solution:** The AI looks at the image (passed as base64) and writes a detailed textual description: *"Visual content analysis (charts, diagrams, patterns in images)"*.
*   **The Result:** We index this *description*. A user searching for "sales chart 2024" will match the description "Bar chart showing sales increase in 2024", even though the vector database only stores text vectors. **This saves massive costs and tokens.**

#### C. Smart Summarization (`summary` field)
*   A concise summary of facts and numbers, prioritizing "findability over brevity".

### 3. Asynchronous Speed
Processing hundreds of chunks with a large LLM can be slow. ChunkSmith implements:
*   **Round-Robin API Keys**: Loads multiple `GOOGLE_API_KEY_n` from env.
*   **Async/Await**: Uses `asyncio.gather` to dispatch dozens of AI tasks simultaneously.
```python
# Cycles through available keys to avoid rate limits
api_key = self.api_keys[i % len(self.api_keys)]
task = self.create_ai_enhanced_summary_async(...)
responses = await asyncio.gather(*tasks)
```

# Vector Database & Embeddings

## Storage Strategy: Qdrant

ChunkSmith uses **Qdrant**, a high-performance vector search engine. We use a "Collection per Project" strategy to ensure data isolation.

### The Embedding Model
We utilize **Google Generative AI Embeddings** (`gemini-embedding-001` or compatible). 
*   **Dimensionality**: Standard high-dimensional vectors (e.g., 768 or 3072 depending on model version) ensure we capture deep semantic meaning.
*   **The "Low Dimensionality" Advantage**: Even if we were to use smaller, faster embeddings (reducing dimensionality to save space/latency), our **Content Enrichment** strategy compensates for the loss of granularity. Because we explicitly index *questions* and *summaries*, the semantic target is much larger and easier to hit than raw, dry text.

### Enriched Logic in `VectorStoreManager`
When saving a document, we don't just save `page_content`. We store a rich metadata object:

```json
{
  "content": "COMBINED_SEARCHABLE_CONTENT",
  "metadata": {
    "original_text": "...",
    "ai_questions": "What is the revenue? ...",
    "ai_summary": "Summary of financial output...",
    "image_interpretation": ["Bar chart of Q1 sales..."],
    "image_paths": ["https://supabase.../img1.png"],
    "raw_tables_html": ["<table>...</table>"]
  }
}
```

### The "Combined Content" Trick
To ensure maximum retrieval accuracy, we construct a special synthetic text block for the vectorizer:

```python
combined_content = f"""
QUESTIONS: {ai_response.question}
SUMMARY: {ai_response.summary}
IMAGE ANALYSIS: {img_analysis_text}
TABLE ANALYSIS: {table_analysis_text}
ORIGINAL TEXT: {content_data['text']}
"""
```

**Why is this powerful?**
If a user asks about an image, they hit the `IMAGE ANALYSIS` section.
If they ask a specific fact, they hit `ORIGINAL TEXT` or `SUMMARY`.
If they ask a concept, they hit `QUESTIONS` or `SUMMARY`.

This ensures that **Text-to-Text retrieval** works for **Text-to-Image** use cases effectively.

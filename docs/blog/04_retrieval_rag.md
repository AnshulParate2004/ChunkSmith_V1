# Retrieval Augmented Generation (RAG) & Chat

The final piece of the puzzle is the `ChatAgent` (`Backend/core/chat_agent.py`). It orchestrates the conversation, bridging the gap between the vector store and the user.

## The Retrieval Process

1.  **Search**: The user's query is embedded and sent to Qdrant.
2.  **Context Reconstruction**: We retrieve the top K (default 3) relevant chunks.
3.  **Image Index Building**:
    *   The agent scans the retrieved chunks for associated images.
    *   It builds a dynamic "Available Images" list for the current context window.
    *   *Crucially*: It does not send the image *data* to the LLM immediately (to save vision tokens). It sends the **descriptions**.

## The System Prompt
The system prompt is carefully engineered to handle this multi-modal metadata:

```text
INSTRUCTIONS:
1. Use the provided context (text, image descriptions, table descriptions)...
2. Return your response in structured format...
3. Only reference images that directly support your answer
...
CONTEXT:
--- Context Chunk 1 ---
Summary: ...
TABLES: ...
IMAGE DESCRIPTIONS: ...
```

## "Blind" Vision Retrieval
This is a unique feature of ChunkSmith. The LLM answers the user's question based on the *description* of the image:

> **User**: "Show me the sales trend."
>
> **LLM (Internal)**: "I see a description for Image 0: 'Line graph showing upward sales trend in 2024'. This matches the user's request. I will reference Image 0."
>
> **Output**: "The sales show an upward trend in 2024..." + `image_references: [0]`

The Frontend then receives this reference and displays the **actual original image** (hosted on Supabase) to the user.

**Assessment**:
*   **Cost**: Low (Text-only processing at inference time).
*   **Speed**: Fast (No heavy image processing during chat).
*   **Experience**: Premium (User sees the actual charts/images from the PDF, not just text descriptions).

## Structured Output & Citations
We use `ChatGoogleGenerativeAI.with_structured_output(ChatResponse)` to guarantee that the response always contains valid `image_references` and a clean `answer`, preventing the common "hallucination" where models invent image links.

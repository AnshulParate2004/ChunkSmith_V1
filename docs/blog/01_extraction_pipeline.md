# Deep Dive: The Extraction Pipeline

## The Challenge
PDFs are notoriously difficult to parse. Text often flows around images, tables are represented as loose collections of lines, and multi-column layouts break standard "read line by line" parsers. ChunkSmith solves this using **Unstructured.io**.

## Implementation: `DocumentParser`

The `DocumentParser` class (`Backend/core/document_parser.py`) is the entry point for raw files.

### 1. Intelligent Partitioning
We uses the `partition` strategy from Unstructured API, which goes beyond simple OCR.
```python
request = operations.PartitionRequest(
    partition_parameters=shared.PartitionParameters(
        files=files,
        strategy="hi_res",  # Implied by extract_image_block_types
        split_pdf_page=True,
        extract_image_block_types=["Image", "Table"],
    )
)
```

### 2. Element Classification
The parser identifies and separates content into distinct types:
*   **`Table`**: These are not just flattened text. We preserve them as HTML (`text_as_html` metadata) so the LLM can understand the row/column structure perfectly later.
*   **`Image`**: Visual elements are detected. Instead of ignoring them, we extract their base64 representation.
*   **`Text`**: Standard narrative text is preserved with reading order intact.

### 3. Handling Multi-Lingual Content
The system is built to be global-ready. It supports a comprehensive mapping of language codes (`Backend/core/document_parser.py`: `SUPPORTED_LANGUAGES`), automatically mapping names like "Hindi" or "French" to their Tesseract/OCR codes (`hin`, `fra`) for accurate character recognition.

### Output
The result is a stream of "Elements" that are easier to digest than a raw PDF. Each element carries metadata like:
*   Page number (crucial for citations)
*   Bounding box coordinates
*   Type (Title, NarrativeText, Table, Image)

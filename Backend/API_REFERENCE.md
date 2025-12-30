# ChunkSmith API Reference - Project-Based Architecture

## Base URL
```
http://localhost:8000/api
```

---

## 📁 **Project Management**

### **1. Create Project**
Creates a new project with empty directory structure.

```http
POST /api/projects
Content-Type: application/json

{
  "project_name": "Legal Documents"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Project created successfully",
  "project_id": "Legal_Documents",
  "project_path": "D:\\...\\data\\Legal_Documents"
}
```

---

### **2. List All Projects**
Returns all projects with file counts.

```http
GET /api/projects
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "projects": [
    {
      "project_id": "Legal_Documents",
      "project_path": "D:\\...\\data\\Legal_Documents",
      "file_count": 3,
      "created_at": 1735564800.0
    }
  ]
}
```

---

### **3. Get Project Details**
Get detailed info about a specific project.

```http
GET /api/projects/{project_id}
```

**Response:**
```json
{
  "success": true,
  "project_id": "Legal_Documents",
  "project_path": "D:\\...\\data\\Legal_Documents",
  "pdf_files": [
    {
      "filename": "contract_20241230_140530.pdf",
      "size_mb": 2.5
    }
  ],
  "pdf_count": 3,
  "image_count": 45,
  "has_vector_store": true,
  "chunks_in_db": 1250
}
```

---

### **4. Delete Project**
Deletes entire project and all its data.

```http
DELETE /api/projects/{project_id}
```

**Response:**
```json
{
  "success": true,
  "message": "Project 'Legal_Documents' deleted successfully",
  "project_id": "Legal_Documents"
}
```

---

## 📄 **PDF Processing**

### **5. Process PDF (Appends to Project)**
Process a PDF and add it to an existing project.

```http
POST /api/process-pdf?project_id=Legal_Documents
Content-Type: multipart/form-data

file: contract.pdf
max_characters: 3000
new_after_n_chars: 3800
combine_text_under_n_chars: 200
extract_images: true
extract_tables: true
languages: english,hindi
```

**Response:**
```json
{
  "success": true,
  "message": "Processing initiated",
  "project_id": "Legal_Documents",
  "document_id": "contract_20241230_140530",
  "stream_url": "/api/process-pdf-stream/contract_20241230_140530"
}
```

---

### **6. Stream Processing Progress (SSE)**
Real-time progress updates via Server-Sent Events.

```http
GET /api/process-pdf-stream/{document_id}
```

**SSE Events:**
```javascript
// Connection
data: {"type": "connected", "data": {...}}

// Progress
data: {"type": "progress", "data": {"status": "processing", "progress": 45, ...}}

// Complete
data: {"type": "complete", "data": {"status": "completed", "progress": 100, ...}}
```

---

## 💬 **Chat (Project-Wide)**

### **7. Initialize Chat Session**
Create a chat session for a project (searches ALL PDFs in project).

```http
POST /api/chat/init/{project_id}
```

**Response:**
```json
{
  "success": true,
  "session_id": "Legal_Documents_0",
  "project_id": "Legal_Documents",
  "message": "Chat session initialized successfully"
}
```

---

### **8. Chat Stream (SSE)**
Stream chat responses with context from all PDFs.

```http
GET /api/chat/stream/{session_id}?message=summarize%20all%20contracts
```

**SSE Events:**
```javascript
data: {"type": "search_start", "data": {"message": "Searching..."}}
data: {"type": "search_complete", "data": {"chunks_count": 3}}
data: {"type": "content", "data": {"content": "The contracts..."}}
data: {"type": "image", "data": {"filename": "image_0001.png", "data": "data:image/png;base64,..."}}
data: {"type": "complete", "data": {"images_shown": 2}}
```

---

### **9. Clear Chat History**
Clear conversation history for a session.

```http
POST /api/chat/clear/{session_id}
```

---

### **10. Delete Chat Session**
Remove a chat session.

```http
DELETE /api/chat/session/{session_id}
```

---

### **11. List Active Sessions**
Get all active chat sessions.

```http
GET /api/chat/sessions
```

---

## 🔍 **Search (Project-Wide)**

### **12. Search Documents**
Search across ALL PDFs in a project.

```http
POST /api/search
Content-Type: application/json

{
  "query": "contract terms and conditions",
  "project_id": "Legal_Documents",
  "k": 5
}
```

**Response:**
```json
{
  "success": true,
  "project_id": "Legal_Documents",
  "query": "contract terms",
  "results_count": 5,
  "results": [
    {
      "rank": 1,
      "content": "The contract terms specify...",
      "metadata": {...}
    }
  ]
}
```

---

## 📊 **Document Viewing**

### **13. View Processed Chunks**
View all chunks for a specific document with images.

```http
GET /api/projects/{project_id}/documents/{document_id}/chunks?include_images=true
```

**Response:**
```json
{
  "success": true,
  "project_id": "Legal_Documents",
  "document_id": "contract_20241230_140530",
  "chunks_count": 45,
  "chunks": [
    {
      "chunk_index": 1,
      "ai_summary": "...",
      "image_paths": ["images/image_0001.png"],
      "images_base64": [{"data": "data:image/png;base64,..."}]
    }
  ]
}
```

---

### **14. Get Project Image**
Retrieve a specific image from a project.

```http
GET /api/projects/{project_id}/images/{image_filename}
```

**Response:** Binary image data

---

## 🌍 **Utilities**

### **15. Get Supported Languages**
List all supported OCR languages.

```http
GET /api/languages
```

**Response:**
```json
{
  "success": true,
  "count": 70,
  "languages": {
    "english": "eng",
    "hindi": "hin",
    "spanish": "spa",
    ...
  }
}
```

---

### **16. Download Project Data**
Download entire project as ZIP.

```http
GET /api/download-project/{project_id}
```

**Response:** ZIP file containing all project data

---

### **17. Health Check**
Check API health and statistics.

```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "data_dir": "D:\\...\\data",
  "api_version": "1.0.0",
  "active_processing": 2,
  "active_chat_sessions": 1,
  "projects_count": 5
}
```

---

## 🔑 **Key Concepts**

### **Project ID**
- Sanitized project name (spaces → underscores)
- Used as ChromaDB collection name
- Each project has isolated data

### **Document ID**
- Format: `{filename}_{timestamp}`
- Example: `contract_20241230_140530`
- Unique identifier for each processed PDF

### **Session ID**
- Format: `{project_id}_{counter}`
- Example: `Legal_Documents_0`
- Used for chat sessions

---

## 📝 **Typical Workflow**

```javascript
// 1. Create project
const project = await fetch('/api/projects', {
  method: 'POST',
  body: JSON.stringify({project_name: 'My Project'})
})

// 2. Upload PDFs (multiple)
await uploadPDF('doc1.pdf', 'My_Project')
await uploadPDF('doc2.pdf', 'My_Project')  // Appends, doesn't delete!

// 3. Initialize chat
const session = await fetch('/api/chat/init/My_Project', {method: 'POST'})

// 4. Chat (searches across both PDFs)
const eventSource = new EventSource(
  `/api/chat/stream/${session.session_id}?message=summarize everything`
)
```

---

**Last Updated:** December 30, 2024  
**Version:** 2.0 (Project-Based Architecture)

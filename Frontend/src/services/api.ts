const API_BASE_URL = 'http://localhost:8000/api';

export interface ProcessSettings {
  languages: string;
  extractImages: boolean;
  extractTables: boolean;
  maxCharacters: number;
  newAfterNChars: number;
  combineTextUnderNChars: number;
}

export interface SearchQuery {
  query: string;
  project_id: string;
  document_id?: string;
  k?: number;
}

export interface Document {
  document_id: string;
  chunks_processed: number;
  images_extracted: number;
  processing_time: number;
  created_at: string;
}

export interface Project {
  project_id: string;
  file_count?: number;
  pdf_count?: number;
  chunks_in_db?: number;
  image_count?: number;
  created_at?: string;
}

export interface ProjectDetails {
  project_id: string;
  pdf_count: number;
  chunks_in_db: number;
  image_count: number;
  documents: string[];
}

class ApiService {
  async healthCheck() {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.json();
  }

  async getLanguages() {
    const response = await fetch(`${API_BASE_URL}/languages`);
    return response.json();
  }

  // NEW: Create a project
  async createProject(projectName: string): Promise<{ project_id: string }> {
    const response = await fetch(`${API_BASE_URL}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ project_name: projectName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create project: ${response.statusText}`);
    }

    return response.json();
  }

  // NEW: List all projects
  async listProjects(): Promise<{ projects: Project[] }> {
    const response = await fetch(`${API_BASE_URL}/projects`);
    
    if (!response.ok) {
      throw new Error(`Failed to list projects: ${response.statusText}`);
    }

    return response.json();
  }

  // NEW: Get project details
  async getProjectDetails(projectId: string): Promise<ProjectDetails> {
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get project details: ${response.statusText}`);
    }

    return response.json();
  }

  // NEW: Delete a project
  async deleteProject(projectId: string): Promise<{ success: boolean; message: string }> {
    const encodedProjectId = encodeURIComponent(projectId);
    const response = await fetch(`${API_BASE_URL}/projects/${encodedProjectId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to delete project: ${response.statusText}`);
    }

    return response.json();
  }

  // UPDATED: Now requires project_id
  async uploadPDF(file: File, settings: ProcessSettings, projectId: string) {
    console.log('=== Upload Debug ===');
    console.log('Project ID:', projectId);
    console.log('Selected language code:', settings.languages);
    console.log('Full settings:', settings);
    
    const queryParams = new URLSearchParams({
      project_id: projectId,
      max_characters: String(settings.maxCharacters),
      new_after_n_chars: String(settings.newAfterNChars),
      combine_text_under_n_chars: String(settings.combineTextUnderNChars),
      extract_images: String(settings.extractImages),
      extract_tables: String(settings.extractTables),
      languages: settings.languages || 'english',
    });

    console.log('🔗 Query params:', queryParams.toString());

    const formData = new FormData();
    formData.append('file', file);

    const url = `${API_BASE_URL}/process-pdf?${queryParams.toString()}`;
    console.log('📤 POST URL:', url);

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Upload response:', result);
    return result;
  }

  // UPDATED: Now requires project_id in query
  async search(query: SearchQuery) {
    const response = await fetch(`${API_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getDocuments() {
    const response = await fetch(`${API_BASE_URL}/documents`);
    return response.json();
  }

  async downloadDocument(documentId: string) {
    const response = await fetch(`${API_BASE_URL}/documents?document_id=${documentId}`);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `document_${documentId}.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  async downloadProjectData(projectId: string) {
    const response = await fetch(`${API_BASE_URL}/download-project/${projectId}`);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectId}_data.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  async downloadAllData() {
    const response = await fetch(`${API_BASE_URL}/download-all`);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'all_projects_data.zip';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // UPDATED: Now uses project_id path
  async getDocumentChunks(projectId: string, documentId: string, includeImages: boolean = true): Promise<DocumentChunksResponse> {
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/documents/${documentId}/chunks?include_images=${includeImages}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch chunks: ${response.statusText}`);
    }
    
    return response.json();
  }

  // UPDATED: Now uses project_id instead of document_id
  async initializeChat(projectId: string) {
    const response = await fetch(`${API_BASE_URL}/chat/init/${projectId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to initialize chat: ${response.statusText}`);
    }

    return response.json();
  }

  async clearChatHistory(sessionId: string) {
    const response = await fetch(`${API_BASE_URL}/chat/clear/${sessionId}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to clear chat history: ${response.statusText}`);
    }

    return response.json();
  }

  // NEW: Get image with project context
  getImageUrl(projectId: string, filename: string): string {
    return `${API_BASE_URL}/projects/${projectId}/images/${filename}`;
  }
}

export interface ChunkImage {
  filename: string;
  data?: string;
  path: string;
  error?: string;
}

export interface DocumentChunk {
  chunk_index: number;
  enhanced_content: string;
  original_text: string;
  raw_tables_html: string[];
  ai_questions: string;
  ai_summary: string;
  image_interpretation: string;
  table_interpretation: string;
  image_paths: string[];
  page_numbers: number[];
  content_types: string[];
  images_base64?: ChunkImage[];
}

export interface DocumentChunksResponse {
  success: boolean;
  document_id: string;
  file_path: string;
  file_size_kb: number;
  chunks_count: number;
  images_included: boolean;
  chunks: DocumentChunk[];
}

export const apiService = new ApiService();

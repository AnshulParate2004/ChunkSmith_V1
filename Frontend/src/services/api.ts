const API_BASE_URL = 'https://chunksmith.onrender.com/api';

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
  pdf_files?: Array<{
    filename: string;
    size_mb: number;
    created_at?: string;
    id?: string;
  }>;
}

class ApiService {
  private getAuthHeaders(): HeadersInit {
    const session = localStorage.getItem('session');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (session) {
      try {
        const parsedSession = JSON.parse(session);
        if (parsedSession.access_token) {
          headers['Authorization'] = `Bearer ${parsedSession.access_token}`;
        }
      } catch (e) {
        console.error('Failed to parse session:', e);
      }
    }

    return headers;
  }

  private getAuthToken(): string | null {
    const session = localStorage.getItem('session');
    if (session) {
      try {
        const parsedSession = JSON.parse(session);
        return parsedSession.access_token || null;
      } catch (e) {
        console.error('Failed to parse session:', e);
        return null;
      }
    }
    return null;
  }

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
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ project_name: projectName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create project: ${response.statusText}`);
    }

    return response.json();
  }

  // List all projects (backend reads from PostgreSQL)
  async listProjects(): Promise<{ projects: Project[] }> {
    const response = await fetch(`${API_BASE_URL}/projects`, {
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to list projects: ${response.statusText}`);
    }
    return response.json();
  }

  // Get project details (backend reads from PostgreSQL)
  async getProjectDetails(projectId: string): Promise<ProjectDetails> {
    const response = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}`, {
      headers: this.getAuthHeaders(),
    });
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
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to delete project: ${response.statusText}`);
    }

    return response.json();
  }

  async deleteDocument(projectId: string, documentId: string): Promise<{ success: boolean; message: string }> {
    const encodedProjectId = encodeURIComponent(projectId);
    const encodedDocumentId = encodeURIComponent(documentId);
    const response = await fetch(
      `${API_BASE_URL}/projects/${encodedProjectId}/documents/${encodedDocumentId}`,
      {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Failed to delete document: ${response.statusText}`);
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

    // Get auth headers (excluding Content-Type for FormData)
    const session = localStorage.getItem('session');
    const headers: HeadersInit = {};
    if (session) {
      try {
        const parsedSession = JSON.parse(session);
        if (parsedSession.access_token) {
          headers['Authorization'] = `Bearer ${parsedSession.access_token}`;
        }
      } catch (e) {
        console.error('Failed to parse session:', e);
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
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
      headers: this.getAuthHeaders(),
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getDocuments() {
    const response = await fetch(`${API_BASE_URL}/documents`, {
      headers: this.getAuthHeaders()
    });
    return response.json();
  }

  async downloadDocument(documentId: string, projectId: string) {
    const response = await fetch(`${API_BASE_URL}/documents?document_id=${documentId}&project_id=${projectId}`, {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

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
    const response = await fetch(`${API_BASE_URL}/projects/download-project/${projectId}`, {
      headers: this.getAuthHeaders()
    });

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
    const response = await fetch(`${API_BASE_URL}/projects/download-all`, {
      headers: this.getAuthHeaders()
    });

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
    const response = await fetch(`${API_BASE_URL}/projects/${projectId}/documents/${documentId}/chunks?include_images=${includeImages}`, {
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch chunks: ${response.statusText}`);
    }

    return response.json();
  }

  // UPDATED: Now uses project_id instead of document_id
  async initializeChat(projectId: string) {
    const response = await fetch(`${API_BASE_URL}/chat/init/${projectId}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to initialize chat: ${response.statusText}`);
    }

    return response.json();
  }

  async clearChatHistory(sessionId: string) {
    const response = await fetch(`${API_BASE_URL}/chat/clear/${sessionId}`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to clear chat history: ${response.statusText}`);
    }

    return response.json();
  }

  // NEW: Get image with project context
  getImageUrl(projectId: string, filename: string): string {
    const token = this.getAuthToken();
    const cleanFilename = filename.split('?')[0]; // Ensure no double query params
    const url = `${API_BASE_URL}/projects/${projectId}/images/${cleanFilename}`;
    return token ? `${url}?token=${token}` : url;
  }

  // ============================================
  // AUTHENTICATION ENDPOINTS
  // ============================================

  async login(email: string, password: string): Promise<{ success: boolean; user: any; session: any }> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(error.detail || 'Login failed');
    }

    return response.json();
  }

  async signup(email: string, password: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Signup failed' }));
      throw new Error(error.detail || 'Signup failed');
    }

    return response.json();
  }

  async logout(token: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) throw new Error('Logout failed');
    return response.json();
  }

  async getSession(token: string): Promise<{ success: boolean; user: any }> {
    const response = await fetch(`${API_BASE_URL}/auth/session`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) throw new Error('Session check failed');
    return response.json();
  }

  // ============================================
  // CONVERSATION ENDPOINTS
  // ============================================

  async createConversation(projectId: string, firstMessage: string, token?: string): Promise<{ success: boolean; conversation: any }> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ project_id: projectId, first_message: firstMessage }),
    });

    if (!response.ok) throw new Error('Failed to create conversation');
    return response.json();
  }

  async listConversations(projectId?: string, token?: string): Promise<{ conversations: any[] }> {
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = new URL(`${API_BASE_URL}/chat/conversations`);
    if (projectId) url.searchParams.append('project_id', projectId);

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) throw new Error('Failed to list conversations');
    const data = await response.json();
    // Backend returns a plain list [], wrap it for callers.
    return { conversations: Array.isArray(data) ? data : [] };
  }

  async getConversationHistory(conversationId: string, token?: string): Promise<{ success: boolean; messages: any[] }> {
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}/messages`, { headers });
    if (!response.ok) throw new Error('Failed to get conversation history');
    return response.json();
  }

  async deleteConversation(conversationId: string, token?: string): Promise<{ success: boolean }> {
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) throw new Error('Failed to delete conversation');
    return response.json();
  }

  async updateConversationTitle(conversationId: string, title: string, token?: string): Promise<{ success: boolean }> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}/title`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title }),
    });

    if (!response.ok) throw new Error('Failed to update conversation title');
    return response.json();
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

import { useEffect, useRef, useState } from 'react';

const API_BASE_URL = 'https://chunksmith.onrender.com/api';

export interface SSEMessage {
  type: 'connected' | 'progress' | 'complete' | 'error';
  data: {
    status?: string;
    step?: number;
    step_name?: string;
    progress?: number;
    message?: string;
    document_id?: string;
    elements_count?: number;
    total_chunks?: number;
    chunks_processed?: number;
    images_extracted?: number;
    result?: {
      document_id: string;
      chunks_processed: number;
      images_extracted: number;
      pickle_path: string;
      json_path: string;
      vector_store_path: string;
    };
  };
}

export const useSSE = (documentId: string | null) => {
  const [messages, setMessages] = useState<SSEMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!documentId) return;

    const connect = () => {
      try {
        // Get auth token from session
        const session = localStorage.getItem('session');
        let token = null;
        if (session) {
          try {
            const parsed = JSON.parse(session);
            token = parsed.access_token;
          } catch (e) {
            console.error('Failed to parse session for SSE', e);
          }
        }

        const url = `${API_BASE_URL}/process-pdf-stream/${documentId}${token ? `?token=${token}` : ''}`;
        const eventSource = new EventSource(url);

        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setConnected(true);
          setError(null);
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            const message: SSEMessage = {
              type: data.type || 'progress',
              data: data.data || data
            };

            setMessages((prev) => [...prev, message]);
          } catch (err) {
            console.error('Failed to parse SSE message:', err);
          }
        };

        eventSource.onerror = (event) => {
          console.error('SSE error:', event);
          setConnected(false);

          // Check if the connection was closed normally (completed/failed)
          if (eventSource.readyState === EventSource.CLOSED) {
            // Connection closed by server
          } else {
            setError('Connection error occurred');
            // Attempt to reconnect after a delay
            setTimeout(() => {
              if (eventSourceRef.current === eventSource) {
                eventSource.close();
                connect();
              }
            }, 3000);
          }
        };
      } catch (err) {
        console.error('Failed to create SSE connection:', err);
        setError('Failed to establish connection');
      }
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [documentId]);

  const clearMessages = () => setMessages([]);

  return { messages, connected, error, clearMessages };
};

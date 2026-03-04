import { useEffect, useRef, useState } from 'react';

const WS_BASE_URL = 'ws://localhost:8000/api/ws';

export interface WebSocketMessage {
  type: 'connected' | 'step' | 'chunk_progress' | 'complete' | 'error' | 'log';
  data: any;
}

export const useWebSocket = (documentId: string | null) => {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    if (!documentId) return;

    const connect = () => {
      try {
        const ws = new WebSocket(`${WS_BASE_URL}/${documentId}`);
        socketRef.current = ws;

        ws.onopen = () => {
          console.log('WebSocket connected');
          setConnected(true);
          setError(null);
          reconnectAttempts.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WebSocketMessage;
            console.log('WebSocket message:', message);
            setMessages((prev) => [...prev, message]);
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          setError('Connection error occurred');
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          setConnected(false);

          // Attempt to reconnect
          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current += 1;
            console.log(`Reconnecting... Attempt ${reconnectAttempts.current}`);
            setTimeout(() => {
              connect();
            }, 2000 * reconnectAttempts.current);
          } else {
            setError('Maximum reconnection attempts reached');
          }
        };
      } catch (err) {
        console.error('Failed to create WebSocket connection:', err);
        setError('Failed to establish connection');
      }
    };

    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [documentId]);

  const clearMessages = () => setMessages([]);

  return { messages, connected, error, clearMessages };
};

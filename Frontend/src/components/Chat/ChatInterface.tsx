import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Trash2 } from 'lucide-react';
import { apiService, API_BASE_URL } from '@/services/api';
import { toast } from 'sonner';
import { StreamingSteps, StreamingStep } from './StreamingSteps';
import { ChatMessage, ChatImage } from './ChatMessage';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
}

interface ChatInterfaceProps {
  documentId: string;
  projectId: string;
  onConversationCreated?: (conversation: any) => void;
}

export const ChatInterface = ({ documentId, projectId, onConversationCreated }: ChatInterfaceProps) => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentImages, setCurrentImages] = useState<ChatImage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingSteps, setStreamingSteps] = useState<StreamingStep[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamingMessageIdRef = useRef<string>('');

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [projectId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingSteps]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const updateStep = (id: string, updates: Partial<StreamingStep>) => {
    setStreamingSteps(prev => prev.map(step =>
      step.id === id ? { ...step, ...updates } : step
    ));
  };

  const addStep = (step: StreamingStep) => {
    setStreamingSteps(prev => [...prev, step]);
  };

  const startStreaming = async (message: string) => {
    // Get auth token from localStorage
    const session = localStorage.getItem('session');
    let token = '';
    if (session) {
      try {
        const parsedSession = JSON.parse(session);
        token = parsedSession.access_token || '';
      } catch (e) {
        console.error('Failed to parse session:', e);
        toast.error('Authentication error');
        return;
      }
    }

    if (!token) {
      toast.error('Please login to use chat');
      return;
    }

    // Ensure we have (or create) a persistent conversation
    let targetConversationId = conversationId;
    if (!targetConversationId) {
      try {
        const response = await apiService.createConversation(
          projectId,
          message,
          token
        );
        targetConversationId = response.conversation.id;
        setConversationId(targetConversationId);
        if (onConversationCreated) {
          onConversationCreated(response.conversation);
        }
      } catch (e) {
        console.error('Failed to create conversation:', e);
        toast.error('Failed to start conversation');
        return;
      }
    }

    setIsStreaming(true);
    setInputMessage('');
    setStreamingSteps([]);
    setCurrentImages([]);

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: message
    };
    setMessages(prev => [...prev, userMsg].slice(-10));

    // Create assistant message for streaming
    streamingMessageIdRef.current = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: streamingMessageIdRef.current,
      type: 'assistant',
      content: '',
      images: []
    };
    setMessages(prev => [...prev, assistantMsg].slice(-10));

    // Connect to SSE with token in query params using persistent conversation endpoint
    const encodedMessage = encodeURIComponent(message);
    const encodedToken = encodeURIComponent(token);
    const eventSource = new EventSource(
      `${API_BASE_URL}/chat/conversations/${targetConversationId}/message_stream?message=${encodedMessage}&token=${encodedToken}`
    );
    eventSourceRef.current = eventSource;

    let planStepId = '';
    let searchStepId = '';
    let readStepId = '';
    let writeStepId = '';
    let imagesStepId = '';

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'connected':
          break;

        case 'planner_plan': {
          planStepId = 'plan-' + Date.now();
          const useRag = data.use_rag;
          const useWeb = data.use_web;
          const ragQuery = data.rag_query || message;
          const webQuery = data.web_query || message;
          addStep({
            id: planStepId,
            type: 'planning',
            label: 'Planning tools to use',
            status: 'complete',
            details: [
              `RAG: ${useRag ? 'ON' : 'OFF'} · ${ragQuery}`,
              `WEB: ${useWeb ? 'ON' : 'OFF'} · ${webQuery}`,
            ],
          });
          break;
        }

        case 'search_start':
          searchStepId = 'search-' + Date.now();
          addStep({
            id: searchStepId,
            type: 'searching',
            label: 'Searching the document',
            status: 'active',
            details: [data.query || message]
          });
          break;

        case 'search_complete':
          if (searchStepId) {
            updateStep(searchStepId, {
              status: 'complete',
              label: `Found ${data.chunks_count} relevant sections`
            });
          }

          readStepId = 'read-' + Date.now();
          addStep({
            id: readStepId,
            type: 'reading',
            label: 'Reading relevant sections',
            status: 'active',
            details: data.sources || []
          });
          break;

        case 'web_search_start': {
          const webStepId = 'web-' + Date.now();
          addStep({
            id: webStepId,
            type: 'searching',
            label: 'Running web search',
            status: 'active',
            details: [data.message || 'Searching the web for more information'],
          });
          break;
        }

        case 'web_search_complete': {
          addStep({
            id: 'web-complete-' + Date.now(),
            type: 'searching',
            label: `Web search complete (${data.results_count ?? 0} results)`, 
            status: 'complete',
          });
          break;
        }

        case 'images_found':
          if (readStepId) {
            updateStep(readStepId, { status: 'complete' });
          }

          if (data.count > 0) {
            imagesStepId = 'images-' + Date.now();
            addStep({
              id: imagesStepId,
              type: 'images',
              label: `Found ${data.count} relevant images`,
              status: 'complete'
            });
          }
          break;

        case 'image': {
          const newImage = { filename: data.filename, data: data.data };
          // Track only the most recent 5 images for the current answer
          setCurrentImages(prev => {
            const next = [...prev, newImage];
            return next.slice(-5);
          });
          // Also immediately add to the streaming message (max 5 images)
          setMessages(prev =>
            prev
              .map(msg =>
                msg.id === streamingMessageIdRef.current
                  ? { ...msg, images: [...(msg.images || []), newImage].slice(-5) }
                  : msg
              )
              .slice(-10)
          );
          break;
        }

        case 'response_start':
          if (readStepId) {
            updateStep(readStepId, { status: 'complete' });
          }

          writeStepId = 'write-' + Date.now();
          addStep({
            id: writeStepId,
            type: 'writing',
            label: 'Writing answer',
            status: 'active'
          });
          break;

        case 'content': {
          // Safely handle missing content to avoid "undefinedundefined" artifacts
          const chunk: string =
            typeof data.content === 'string'
              ? data.content
              : typeof data.answer === 'string'
                ? data.answer
                : '';

          if (!chunk) {
            break;
          }

          setMessages(prev =>
            prev
              .map(msg =>
                msg.id === streamingMessageIdRef.current
                  ? { ...msg, content: msg.content + chunk }
                  : msg
              )
              .slice(-10)
          );
          break;
        }

        case 'complete':
          if (writeStepId) {
            updateStep(writeStepId, { status: 'complete', label: 'Answer complete' });
          }

          setMessages(prev =>
            prev
              .map(msg =>
                msg.id === streamingMessageIdRef.current ? { ...msg } : msg
              )
              .slice(-10)
          );
          break;

        case 'end':
          setIsStreaming(false);
          setTimeout(() => {
            setStreamingSteps([]);
          }, 1000);
          eventSource.close();
          break;
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE Error:', error);
      toast.error('Connection error');
      setIsStreaming(false);
      setStreamingSteps([]);
      eventSource.close();
    };
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim() || isStreaming) return;
    startStreaming(inputMessage);
  };

  const handleClearHistory = async () => {
    // For conversation-based chat, just clear local view.
    setMessages([]);
    setCurrentImages([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
        <h3 className="text-lg font-semibold">Chat Assistant</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearHistory}
          disabled={messages.length === 0}
          className="gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-6">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg mb-2">Start a conversation</p>
              <p className="text-sm">Ask questions about your document</p>
            </div>
          )}

          {messages.map((msg, index) => {
            const isLastAssistant = msg.type === 'assistant' && index === messages.length - 1;
            const showSteps = isLastAssistant && isStreaming && streamingSteps.length > 0;

            return (
              <div key={msg.id}>
                {showSteps && (
                  <StreamingSteps steps={streamingSteps} />
                )}

                <ChatMessage
                  type={msg.type}
                  content={msg.content}
                  images={msg.images}
                  isStreaming={isLastAssistant && isStreaming}
                />
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="flex gap-2 pt-4 mt-4 border-t border-border">
        <Input
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder="Ask a question..."
          disabled={isStreaming}
          className="flex-1"
        />
        <Button
          onClick={handleSendMessage}
          disabled={isStreaming || !inputMessage.trim()}
          size="icon"
        >
          {isStreaming ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
};

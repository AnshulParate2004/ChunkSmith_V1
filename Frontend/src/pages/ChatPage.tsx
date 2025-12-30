import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Send, Loader2, Trash2 } from 'lucide-react';
import { apiService } from '@/services/api';
import { toast } from 'sonner';
import { StreamingSteps, StreamingStep } from '@/components/Chat/StreamingSteps';
import { ChatMessage, ChatImage } from '@/components/Chat/ChatMessage';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
}

const ChatPage = () => {
  // Now uses projectId instead of documentId
  const { documentId: projectId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentImages, setCurrentImages] = useState<ChatImage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingSteps, setStreamingSteps] = useState<StreamingStep[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamingMessageIdRef = useRef<string>('');

  useEffect(() => {
    if (projectId) {
      initializeChat();
    }
    
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

  const initializeChat = async () => {
    if (!projectId) return;
    
    try {
      // Now uses project_id instead of document_id
      const response = await apiService.initializeChat(projectId);
      setSessionId(response.session_id);
      toast.success('Chat initialized successfully');
    } catch (error) {
      toast.error('Failed to initialize chat');
      console.error(error);
    }
  };

  const updateStep = (id: string, updates: Partial<StreamingStep>) => {
    setStreamingSteps(prev => prev.map(step => 
      step.id === id ? { ...step, ...updates } : step
    ));
  };

  const addStep = (step: StreamingStep) => {
    setStreamingSteps(prev => [...prev, step]);
  };

  const startStreaming = (message: string) => {
    if (!sessionId) {
      toast.error('Chat not initialized');
      return;
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
    setMessages(prev => [...prev, userMsg]);

    // Create assistant message for streaming
    streamingMessageIdRef.current = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: streamingMessageIdRef.current,
      type: 'assistant',
      content: '',
      images: []
    };
    setMessages(prev => [...prev, assistantMsg]);

    // Connect to SSE
    const encodedMessage = encodeURIComponent(message);
    const eventSource = new EventSource(
      `http://localhost:8000/api/chat/stream/${sessionId}?message=${encodedMessage}`
    );
    eventSourceRef.current = eventSource;

    let searchStepId = '';
    let readStepId = '';
    let writeStepId = '';
    let imagesStepId = '';

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'connected':
          // Initial connection
          break;
          
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
          
          // Add reading step
          readStepId = 'read-' + Date.now();
          addStep({
            id: readStepId,
            type: 'reading',
            label: 'Reading relevant sections',
            status: 'active',
            details: data.sources || []
          });
          break;
          
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
          
        case 'image':
          setCurrentImages(prev => [...prev, { filename: data.filename, data: data.data }]);
          break;
          
        case 'response_start':
          // Complete reading step if not done
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
          
        case 'content':
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessageIdRef.current
              ? { ...msg, content: msg.content + data.content }
              : msg
          ));
          break;
          
        case 'complete':
          if (writeStepId) {
            updateStep(writeStepId, { status: 'complete', label: 'Answer complete' });
          }
          
          // Attach images to the assistant message
          setMessages(prev => prev.map(msg => 
            msg.id === streamingMessageIdRef.current
              ? { ...msg, images: [...(msg.images || []), ...currentImages] }
              : msg
          ));
          break;
          
        case 'end':
          setIsStreaming(false);
          // Clear streaming steps after a delay
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
    if (!sessionId) return;
    
    try {
      await apiService.clearChatHistory(sessionId);
      setMessages([]);
      setCurrentImages([]);
      toast.success('Chat history cleared');
    } catch (error) {
      toast.error('Failed to clear history');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/project/${projectId}`)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Project Chat</h1>
              <p className="text-sm text-muted-foreground">Ask questions about your documents in {projectId}</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleClearHistory} 
            disabled={!sessionId || messages.length === 0}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </Button>
        </div>

        {/* Chat Area */}
        <Card className="p-6 flex flex-col h-[calc(100vh-180px)]">
          {/* Messages */}
          <ScrollArea className="flex-1 pr-4 mb-4">
            <div className="space-y-6">
              {messages.length === 0 && !isStreaming && (
                <div className="text-center py-16 text-muted-foreground">
                  <p className="text-lg mb-2">Start a conversation</p>
                  <p className="text-sm">Ask questions about your documents and get detailed answers</p>
                </div>
              )}
              
              {messages.map((msg, index) => {
                const isLastAssistant = msg.type === 'assistant' && index === messages.length - 1;
                const showSteps = isLastAssistant && isStreaming && streamingSteps.length > 0;
                
                return (
                  <div key={msg.id}>
                    {/* Show streaming steps before the assistant's response */}
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
          <div className="flex gap-2 pt-4 border-t border-border">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask a question about your documents..."
              disabled={isStreaming || !sessionId}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={isStreaming || !sessionId || !inputMessage.trim()}
              size="icon"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ChatPage;

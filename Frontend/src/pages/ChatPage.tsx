import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { apiService } from '@/services/api';
import { toast } from 'sonner';
import { StreamingSteps, StreamingStep } from '@/components/Chat/StreamingSteps';
import { ChatMessage, ChatImage } from '@/components/Chat/ChatMessage';
import { useAuth } from '@/context/AuthContext';
import { ChatSidebar } from '@/components/Chat/ChatSidebar';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

const ChatPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentImages, setCurrentImages] = useState<ChatImage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingSteps, setStreamingSteps] = useState<StreamingStep[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamingMessageIdRef = useRef<string>('');

  // Fetch conversations on load
  useEffect(() => {
    if (projectId && session?.access_token) {
      loadConversations();
    }
  }, [projectId, session?.access_token]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (activeConversationId && session?.access_token) {
      loadMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId, session?.access_token]);

  // Clean up event source
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingSteps]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadConversations = async () => {
    if (!projectId || !session?.access_token) return;
    try {
      const response = await apiService.listConversations(projectId, session.access_token);
      setConversations(response.conversations);

      // Auto-select most recent if available
      if (response.conversations.length > 0 && !activeConversationId) {
        setActiveConversationId(response.conversations[0].id);
      }
    } catch (error) {
      toast.error('Failed to load conversations');
    }
  };

  const loadMessages = async (conversationId: string) => {
    if (!session?.access_token) return;
    try {
      const response = await apiService.getConversationHistory(conversationId, session.access_token);

      // Map DB messages to UI format
      const mappedMessages: Message[] = response.messages.map((msg: any) => ({
        id: msg.id,
        type: msg.role,
        content: msg.content,
        // We might want to parse images if we store them in DB, but for now history is text
        images: []
      }));
      setMessages(mappedMessages);
    } catch (error) {
      toast.error('Failed to load messages');
    }
  };

  const handleNewChat = async () => {
    if (!projectId || !session?.access_token) return;
    try {
      const response = await apiService.createConversation(projectId, "New Conversation", session.access_token);
      setConversations([response.conversation, ...conversations]);
      setActiveConversationId(response.conversation.id);
      setMessages([]);
    } catch (error) {
      toast.error('Failed to create conversation');
    }
  };

  const handleDeleteConversation = async (id: string) => {
    if (!session?.access_token) return;
    try {
      await apiService.deleteConversation(id, session.access_token);
      setConversations(conversations.filter(c => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
      toast.success('Conversation deleted');
    } catch (error) {
      toast.error('Failed to delete conversation');
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

  const startStreaming = async (message: string) => {
    if (!session?.access_token) return;

    let targetConversationId = activeConversationId;

    // specific check: if no active conversation, create one
    if (!targetConversationId) {
      try {
        const response = await apiService.createConversation(projectId!, message.substring(0, 30) + "...", session.access_token);
        targetConversationId = response.conversation.id;
        setConversations([response.conversation, ...conversations]);
        setActiveConversationId(targetConversationId);
      } catch (error) {
        toast.error('Failed to start conversation');
        return;
      }
    }

    setIsStreaming(true);
    setInputMessage('');
    setStreamingSteps([]);
    setCurrentImages([]);

    // Add user message locally (it's also saved in DB by backend)
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

    // Connect to SSE with Token
    const encodedMessage = encodeURIComponent(message);
    const encodedToken = encodeURIComponent(session.access_token);

    // Use new endpoint
    const url = `https://chunksmith.onrender.com/api/chat/conversations/${targetConversationId}/message_stream?message=${encodedMessage}&token=${encodedToken}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    let searchStepId = '';
    let readStepId = '';
    let writeStepId = '';
    let imagesStepId = '';

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'connected':
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

          setMessages(prev => prev.map(msg =>
            msg.id === streamingMessageIdRef.current
              ? { ...msg, images: [...(msg.images || []), ...currentImages] }
              : msg
          ));
          break;

        case 'end':
          setIsStreaming(false);
          setTimeout(() => {
            setStreamingSteps([]);
          }, 1000);
          eventSource.close();
          break;

        case 'error':
          console.error('Stream Error:', data.message);
          toast.error('Stream error: ' + data.message);
          setIsStreaming(false);
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

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/project/${projectId}`)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Project Chat</h1>
            <p className="text-xs text-muted-foreground">in {projectId}</p>
          </div>
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Sidebar */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="hidden md:block">
          <ChatSidebar
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={setActiveConversationId}
            onNew={handleNewChat}
            onDelete={handleDeleteConversation}
          />
        </ResizablePanel>

        <ResizableHandle />

        {/* Chat Area */}
        <ResizablePanel defaultSize={80}>
          <div className="h-full flex flex-col">
            {/* Messages */}
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6 max-w-4xl mx-auto">
                {messages.length === 0 && !isStreaming && (
                  <div className="text-center py-16 text-muted-foreground">
                    <p className="text-lg mb-2">Start a conversation</p>
                    <p className="text-sm">Ask detailed questions about your documents.</p>
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
            <div className="p-4 border-t bg-background">
              <div className="max-w-4xl mx-auto flex gap-2">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask a question about your documents..."
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
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default ChatPage;

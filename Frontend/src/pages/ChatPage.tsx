import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { apiService, API_BASE_URL } from '@/services/api';
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

interface SidebarDocument {
  id: string;
  title: string;
  created_at?: string;
}

const ChatPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [searchParams] = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const [sidebarMode, setSidebarMode] = useState<"chats" | "documents">("chats");
  const [sidebarDocuments, setSidebarDocuments] = useState<SidebarDocument[]>([]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [currentImages, setCurrentImages] = useState<ChatImage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingSteps, setStreamingSteps] = useState<StreamingStep[]>([]);

  // When we create a brand-new conversation and immediately stream,
  // we don't want the initial auto history load to overwrite the
  // in-flight streaming messages (which already contain images).
  const [skipNextHistoryLoad, setSkipNextHistoryLoad] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamingMessageIdRef = useRef<string>('');

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;
  const [titleDraft, setTitleDraft] = useState<string>("");

  useEffect(() => {
    if (activeConversation) {
      setTitleDraft(activeConversation.title || "New Chat");
    } else {
      setTitleDraft("");
    }
  }, [activeConversationId, conversations.length]);

  // Fetch conversations and documents on load
  useEffect(() => {
    if (projectId && session?.access_token) {
      loadConversations();
      loadDocuments();
    }
  }, [projectId, session?.access_token, searchParams]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (activeConversationId && session?.access_token) {
      if (skipNextHistoryLoad) {
        // Skip the very first history load after creating a new conversation.
        // The live streaming state already has the correct text + images.
        setSkipNextHistoryLoad(false);
        return;
      }
      loadMessages(activeConversationId);
    }
  }, [activeConversationId, session?.access_token, skipNextHistoryLoad]);

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

      // Auto-select most recent if available, unless "new=1" is present
      const initialId = searchParams.get('conversationId');
      const newFlag = searchParams.get('new');
      if (response.conversations.length > 0) {
        if (initialId) {
          setActiveConversationId(initialId);
        } else if (!activeConversationId && newFlag !== '1') {
          setActiveConversationId(response.conversations[0].id);
        }
      }
    } catch (error) {
      toast.error('Failed to load conversations');
    }
  };

  // Load documents for sidebar (documents mode) using project details
  const loadDocuments = async () => {
    if (!projectId || !session?.access_token) return;
    try {
      const response = await apiService.getProjectDetails(projectId);
      const docs: SidebarDocument[] =
        response.pdf_files?.map((pdf: any) => ({
          id: pdf.id || pdf.filename || "",
          title: pdf.filename || "",
          created_at: pdf.created_at,
        })) || [];
      setSidebarDocuments(docs);
    } catch (error) {
      console.error("Failed to load documents for sidebar:", error);
    }
  };

  const loadMessages = async (conversationId: string) => {
    if (!session?.access_token || !projectId) return;
    try {
      const response = await apiService.getConversationHistory(conversationId, session.access_token);

      // Map DB messages to UI format; restore images from metadata.image_filenames via image API URL
      const mappedMessages: Message[] = (response.messages || []).map((msg: any) => {
        const images =
          msg.role === 'assistant' && Array.isArray(msg.metadata?.image_filenames)
            ? msg.metadata.image_filenames.map((filename: string) => ({
                filename,
                url: apiService.getImageUrl(projectId!, filename),
              }))
            : [];
        return {
          id: msg.id,
          type: msg.role,
          content: msg.content ?? '',
          images,
        };
      });
      // If there is no stored history yet (e.g. brand new conversation),
      // avoid overwriting any in-flight streaming messages with an empty list.
      if (mappedMessages.length > 0) {
        setMessages(mappedMessages);
      }
    } catch (error) {
      toast.error('Failed to load messages');
    }
  };

  const handleNewChat = async () => {
    // Reset to a fresh, untitled conversation.
    setActiveConversationId(null);
    setMessages([]);
    setStreamingSteps([]);
    setCurrentImages([]);
    setTitleDraft("");
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
        const response = await apiService.createConversation(projectId!, message, session.access_token);
        targetConversationId = response.conversation.id;
        setConversations([response.conversation, ...conversations]);
        setActiveConversationId(targetConversationId);
        // We just created a fresh conversation and will immediately stream into it.
        // Skip the first automatic history load so it doesn't race with streaming
        // and overwrite images/text that are already in local state.
        setSkipNextHistoryLoad(true);
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

    // Connect to SSE with Token
    const encodedMessage = encodeURIComponent(message);
    const encodedToken = encodeURIComponent(session.access_token);

    const url = `${API_BASE_URL}/chat/conversations/${targetConversationId}/message_stream?message=${encodedMessage}&token=${encodedToken}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;
    const conversationIdForStream = targetConversationId;

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
          // Maintain only the most recent 5 images for the current answer
          setCurrentImages(prev => {
            const next = [...prev, { filename: data.filename, data: data.data }];
            return next.slice(-5);
          });
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
          // Safely handle missing content to avoid "undefinedundefined" text
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
                msg.id === streamingMessageIdRef.current
                  ? { ...msg, images: [...(msg.images || []), ...currentImages].slice(-5) }
                  : msg
              )
              .slice(-10)
          );
          break;

        case 'end':
          setIsStreaming(false);
          setTimeout(() => {
            setStreamingSteps([]);
          }, 1000);
          // After stream ends, reload history once so that
          // we are guaranteed to show the saved assistant
          // message and its images, even if streaming UI
          // was interrupted or out-of-sync.
          if (conversationIdForStream && session?.access_token) {
            loadMessages(conversationIdForStream);
          }
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

  const handleTitleSave = async () => {
    if (!session?.access_token || !activeConversationId) return;
    const trimmed = titleDraft.trim();
    if (!trimmed) return;
    try {
      await apiService.updateConversationTitle(activeConversationId, trimmed, session.access_token);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId ? { ...c, title: trimmed } : c
        )
      );
      toast.success("Title updated");
    } catch {
      toast.error("Failed to update title");
    }
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
            <h1 className="text-xl font-bold mb-1">
              {activeConversation ? "Conversation" : "Project Chat"}
            </h1>
            {activeConversation ? (
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleTitleSave();
                  }
                }}
                className="h-8 px-2 text-sm font-medium max-w-xs"
              />
            ) : (
              <p className="text-xs text-muted-foreground">in {projectId}</p>
            )}
          </div>
        </div>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Sidebar */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="hidden md:block">
          <ChatSidebar
            conversations={conversations}
            documents={sidebarDocuments}
            activeConversationId={activeConversationId}
            mode={sidebarMode}
            onModeChange={setSidebarMode}
            onSelectConversation={setActiveConversationId}
            onSelectDocument={(docId) => {
              if (projectId) {
                navigate(`/project/${projectId}?documentId=${docId}`);
              }
            }}
            onNewChat={handleNewChat}
            onDeleteConversation={handleDeleteConversation}
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

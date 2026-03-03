import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, Globe, Settings, FileText, Sparkles, Upload, Search, X, Clock, CheckCircle, Loader2, ArrowLeft, Download, Eye, Trash2 } from 'lucide-react';
import { ChatInterface } from '@/components/Chat/ChatInterface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUpload } from '@/components/Upload/FileUpload';
import { UploadSettings } from '@/components/Upload/UploadSettings';
import { ProcessSettings } from '@/services/api';
import { apiService } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';

interface UploadedDoc {
  name: string;
  size: number;
  documentId: string;
  uploadedAt: string;
  status?: 'processing' | 'complete' | 'error';
  projectId?: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  created_at: string;
}

interface ProcessedDocument {
  documentId: string;
  fileName: string;
  processingTime: number;
  completedAt: string;
}

const ProjectPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { session } = useAuth();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<UploadedDoc | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [activeChatDoc, setActiveChatDoc] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"documents" | "conversations">("documents");

  const [settings, setSettings] = useState<ProcessSettings>({
    languages: 'english',
    extractImages: true,
    extractTables: true,
    maxCharacters: 3000,
    newAfterNChars: 3800,
    combineTextUnderNChars: 200,
  });

  useEffect(() => {
    console.log('🔧 Settings updated:', settings);
  }, [settings]);

  useEffect(() => {
    // Fetch documents from API instead of localStorage
    const loadDocuments = async () => {
      if (!projectId) return;

      try {
        const response = await apiService.getProjectDetails(projectId);
        // Map API response to UploadedDoc format
        const mapStatus = (s?: string): 'processing' | 'complete' | 'error' => {
          if (s === 'completed') return 'complete';
          if (s === 'processing' || s === 'queued') return 'processing';
          if (s === 'failed') return 'error';
          return 'complete';
        };
        const docs: UploadedDoc[] = response.pdf_files?.map((pdf: any) => ({
          name: pdf.filename,
          size: pdf.size_mb * 1024 * 1024,
          documentId: pdf.id || pdf.filename?.replace('.pdf', '') || '',
          uploadedAt: pdf.created_at || new Date().toISOString(),
          status: mapStatus(pdf.status),
          projectId: projectId
        })) || [];

        setUploadedDocs(docs);
      } catch (error) {
        console.error('Failed to load documents:', error);
        setUploadedDocs([]);
      }
    };

    // Load documents only once when page loads
    loadDocuments();
  }, [projectId]);

  // Load conversation history for this project (for sidebar + summary)
  useEffect(() => {
    const loadConversations = async () => {
      if (!projectId || !session?.access_token) return;
      try {
        const response = await apiService.listConversations(projectId, session.access_token);
        setConversations(response.conversations || []);
      } catch (error) {
        console.error('Failed to load conversations:', error);
      }
    };
    loadConversations();
  }, [projectId, session?.access_token]);

  const projectTitle = projectId || 'Project';

  const filteredDocs = uploadedDocs.filter(doc =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'processing':
        return <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />;
      case 'error':
        return <X className="w-3 h-3 text-red-500" />;
      default:
        return <Clock className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'complete':
        return <Badge variant="default" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">Complete</Badge>;
      case 'processing':
        return <Badge variant="default" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">Processing</Badge>;
      case 'error':
        return <Badge variant="destructive" className="text-xs">Error</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Pending</Badge>;
    }
  };

  const handleDocClick = (doc: UploadedDoc) => {
    navigate(`/processing/${doc.documentId}?projectId=${projectId}`);
  };

  const handleDeleteDocument = async (doc: UploadedDoc) => {
    if (!projectId) return;
    const confirmed = window.confirm(
      `Delete processed document "${doc.name}" from this project? (This will hide it from the list but keep underlying files for recovery.)`
    );
    if (!confirmed) return;

    try {
      await apiService.deleteDocument(projectId, doc.documentId);
      setUploadedDocs(prev => prev.filter(d => d.documentId !== doc.documentId));
      toast({
        title: 'Document deleted',
        description: `"${doc.name}" has been removed from this project.`,
      });
    } catch (error: any) {
      toast({
        title: 'Failed to delete document',
        description: error.message || 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleNewConversation = () => {
    // Start a chat within this project page, using the first completed document
    const completeDocs = uploadedDocs.filter(doc => doc.status === 'complete');
    if (completeDocs.length > 0) {
      setActiveChatDoc(completeDocs[0].documentId);
    } else {
      toast({
        title: "No documents ready",
        description: "Please upload and process a document first",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (file: File) => setSelectedFile(file);
  const handleClearFile = () => setSelectedFile(null);

  // ✅ FIX: Use useCallback to ensure fresh settings reference
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    if (!settings.languages || settings.languages.trim() === '') {
      toast({
        title: "Language not selected",
        description: "Please select a document language before uploading",
        variant: "destructive"
      });
      return;
    }

    console.log('📤 Upload initiated with settings:', settings);
    console.log('📝 Language being sent to backend:', settings.languages);
    console.log('📄 File:', selectedFile.name);

    setIsUploading(true);
    try {
      const result = await apiService.uploadPDF(selectedFile, settings, projectId!);

      toast({
        title: "File uploaded successfully!",
        description: `Processing document: ${selectedFile.name} (Language: ${settings.languages})`,
      });

      setSelectedFile(null);
      navigate(`/processing/${result.document_id}?projectId=${projectId}`);
    } catch (error) {
      console.error('❌ Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, settings, uploadedDocs, projectId, toast, navigate]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-sm">
        <div className="p-6">
          {/* Brand row, similar to ChatGPT icon + name */}
          <div className="flex items-center gap-2 mb-6">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <h1 className="text-sm font-semibold text-foreground">ChunkSmith</h1>
          </div>

          {/* Primary actions like ChatGPT sidebar */}
          <div className="space-y-2 mb-6">
            <Button
              variant="default"
              className="w-full justify-start gap-2 text-sm"
              onClick={handleNewConversation}
            >
              <Plus className="w-4 h-4" />
              New chat
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sm"
              onClick={() => navigate(`/search?projectId=${projectId}`)}
            >
              <Search className="w-4 h-4" />
              Search chats
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-sm"
              onClick={() =>
                setSidebarMode(sidebarMode === "documents" ? "conversations" : "documents")
              }
            >
              {sidebarMode === "documents" ? (
                <>
                  <MessageSquare className="w-4 h-4" />
                  Conversations
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Documents
                </>
              )}
            </Button>
          </div>

          {/* Sidebar list area: toggles between documents and conversations */}
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {sidebarMode === "documents" ? "Your documents" : "Your conversations"}
            </h3>
            <span className="text-xs text-muted-foreground">
              {sidebarMode === "documents" ? uploadedDocs.length : conversations.length}
            </span>
          </div>

          {sidebarMode === "documents" && uploadedDocs.length > 0 && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 bg-background/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          )}

          <div className="space-y-2">
            {sidebarMode === "documents" ? (
              <>
                {uploadedDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No documents uploaded yet
                  </p>
                ) : filteredDocs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No documents match your search
                  </p>
                ) : (
                  filteredDocs.map((doc, index) => (
                    <div
                      key={`${doc.documentId}-${index}`}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors group"
                    >
                      <button
                        onClick={() => handleDocClick(doc)}
                        className="flex-1 flex items-center gap-3 text-left"
                      >
                        <div className="relative">
                          <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                          <div className="absolute -top-1 -right-1">
                            {getStatusIcon(doc.status)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate block">
                              {doc.name}
                            </span>
                            {getStatusBadge(doc.status)}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {(doc.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteDocument(doc)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive flex-shrink-0"
                        title="Delete processed document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                {conversations.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No conversations yet
                  </p>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() =>
                        navigate(`/chat/${projectId}?conversationId=${conv.id}`)
                      }
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                          <MessageSquare className="w-3 h-3 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {conv.title || "Conversation"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {conv.created_at
                              ? new Date(conv.created_at).toLocaleString()
                              : ""}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex">
        <div className="flex-1 p-8">
          <div className="max-w-4xl mx-auto h-full flex flex-col">
            {activeChatDoc ? (
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-4 mb-6">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setActiveChatDoc(null)}
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <div>
                    <h2 className="text-2xl font-bold">{projectTitle}</h2>
                    <p className="text-sm text-muted-foreground">
                      Chatting with: {uploadedDocs.find(d => d.documentId === activeChatDoc)?.name}
                    </p>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <div className="glass-card p-6 h-full">
                    <ChatInterface
                      documentId={activeChatDoc}
                      projectId={projectId!}
                      onConversationCreated={(conv) =>
                        setConversations((prev) => [conv, ...prev])
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <div className="flex items-center gap-4 mb-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate('/dashboard')}
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                      <h2 className="text-3xl font-bold">{projectTitle}</h2>
                      <p className="text-muted-foreground">{uploadedDocs.length} files • Last modified recently</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold">Conversations</h3>
                    <span className="text-sm text-muted-foreground">{conversations.length}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button className="gap-2" onClick={handleNewConversation}>
                      <Plus className="w-4 h-4" />
                      New conversation
                    </Button>
                  </div>
                </div>

                {conversations.length === 0 && uploadedDocs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="p-4 bg-muted/50 rounded-full mb-6">
                      <MessageSquare className="w-12 h-12 text-muted-foreground" />
                    </div>
                    <h4 className="text-xl font-semibold mb-2">No conversations yet</h4>
                    <p className="text-muted-foreground mb-6 text-center max-w-md">
                      Start your first conversation in this project to analyze documents and get insights from your AI assistant.
                    </p>
                    <Button className="gap-2" onClick={handleNewConversation}>
                      <Plus className="w-4 h-4" />
                      Start first conversation
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {conversations.map((conv) => (
                      <button
                        key={conv.id}
                        onClick={() => navigate(`/chat/${projectId}?conversationId=${conv.id}`)}
                        className="w-full text-left glass-card p-4 hover:border-primary/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <MessageSquare className="w-5 h-5 text-primary" />
                          <div>
                            <span className="font-medium block truncate">
                              {conv.title || 'Conversation'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {conv.created_at ? new Date(conv.created_at).toLocaleString() : ''}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Sidebar - Knowledge Base */}
        <aside className="w-96 border-l border-border bg-card/30 backdrop-blur-sm overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Knowledge Base</h3>
              </div>
            </div>

            <Tabs defaultValue="documents" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="documents" className="flex-1">
                  <FileText className="w-4 h-4 mr-2" />
                  Documents
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex-1">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </TabsTrigger>
                <TabsTrigger value="search" className="flex-1">
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </TabsTrigger>
              </TabsList>

              <TabsContent value="documents" className="space-y-6 mt-6">
                <div>
                  <h4 className="text-sm font-semibold mb-4">Add Sources</h4>

                  <FileUpload
                    onFileSelect={handleFileSelect}
                    selectedFile={selectedFile}
                    onClearFile={handleClearFile}
                  />

                  {selectedFile && (
                    <div className="mt-4">
                      <UploadSettings
                        settings={settings}
                        onSettingsChange={(newSettings) => {
                          console.log('⚙️ UploadSettings callback - New settings:', newSettings);
                          setSettings(newSettings);
                        }}
                      />

                      {settings.languages && (
                        <div className="mt-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
                          <p className="text-xs text-muted-foreground">Selected language:</p>
                          <p className="text-sm font-medium text-primary">{settings.languages}</p>
                        </div>
                      )}

                      {!settings.languages && (
                        <div className="mt-3 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                          <p className="text-xs text-yellow-600 dark:text-yellow-400">
                            ⚠️ Please select a language before uploading
                          </p>
                        </div>
                      )}

                      <Button
                        onClick={handleUpload}
                        disabled={isUploading || !settings.languages}
                        className="w-full mt-4"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          'Start Processing'
                        )}
                      </Button>
                    </div>
                  )}

                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border"></div>
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-card px-2 text-muted-foreground">OR</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Paste website URL"
                        className="pl-10 bg-background/50"
                      />
                    </div>
                    <Button variant="outline" className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add website
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="search" className="space-y-4 mt-6">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Search processed documents</h4>
                  <p className="text-xs text-muted-foreground mb-4">
                    Run semantic search over all processed chunks in this project.
                  </p>
                  <Button
                    className="w-full gap-2"
                    onClick={() => navigate(`/search?projectId=${projectId}`)}
                  >
                    <Search className="w-4 h-4" />
                    Open search
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="settings" className="mt-6">
                <p className="text-sm text-muted-foreground">Project settings will appear here</p>
              </TabsContent>
            </Tabs>
          </div>
        </aside>
      </main>

      {/* Document Details Modal */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Document Details</DialogTitle>
          </DialogHeader>

          {selectedDoc && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <FileText className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{selectedDoc.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {(selectedDoc.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                {getStatusBadge(selectedDoc.status)}
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-medium capitalize">{selectedDoc.status || 'Pending'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Uploaded:</span>
                  <span className="font-medium">
                    {new Date(selectedDoc.uploadedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Document ID:</span>
                  <span className="font-mono text-xs">{selectedDoc.documentId.slice(0, 8)}...</span>
                </div>
              </div>

              {selectedDoc.status === 'complete' && (
                <Button
                  onClick={() => {
                    navigate(`/processing/${selectedDoc.documentId}?projectId=${projectId}`);
                    setIsDetailsOpen(false);
                  }}
                  className="w-full"
                >
                  View Processing Details
                </Button>
              )}

              {selectedDoc.status === 'processing' && (
                <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    This document is currently being processed. Check back in a moment.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectPage;
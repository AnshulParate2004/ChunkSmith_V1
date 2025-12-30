import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, Globe, Settings, FileText, Sparkles, Upload, Search, X, Clock, CheckCircle, Loader2, ArrowLeft } from 'lucide-react';
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

interface UploadedDoc {
  name: string;
  size: number;
  documentId: string;
  uploadedAt: string;
  status?: 'processing' | 'complete' | 'error';
  projectId?: string;
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [conversations, setConversations] = useState<string[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<UploadedDoc | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [activeChatDoc, setActiveChatDoc] = useState<string | null>(null);
  
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
    if (projectId) {
      // Ensure subsequent uploads & "Back" navigation resolve to the correct project
      localStorage.setItem('currentProjectId', projectId);
    }

    const loadDocuments = () => {
      const savedDocs = localStorage.getItem(`project_${projectId}_docs`);
      if (savedDocs) {
        let docs: UploadedDoc[] = JSON.parse(savedDocs);
        let hasUpdates = false;

        docs = docs.map(doc => {
          if (doc.status === 'processing') {
            const processingData = localStorage.getItem(`processing_${doc.documentId}`);
            if (processingData) {
              hasUpdates = true;
              return { ...doc, status: 'complete' as const };
            }
          }
          return doc;
        });

        if (hasUpdates) {
          localStorage.setItem(`project_${projectId}_docs`, JSON.stringify(docs));
        }

        setUploadedDocs(docs);
      } else {
        // Keep UI consistent even when there are no docs yet
        setUploadedDocs([]);
      }
    };

    loadDocuments();
    const interval = setInterval(loadDocuments, 1000);
    return () => clearInterval(interval);
  }, [projectId]);
  
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
    navigate(`/processing/${doc.documentId}`);
  };

  const handleNewConversation = () => {
    const completeDocs = uploadedDocs.filter(doc => doc.status === 'complete');
    if (completeDocs.length > 0) {
      setActiveChatDoc(completeDocs[0].documentId);
    } else {
      toast({
        title: "No documents ready",
        description: "Please upload and process a document first",
        variant: "destructive"
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

      // Map document → project for reliable "Back to Project" behavior
      localStorage.setItem(`doc_${result.document_id}_project`, projectId!);

      toast({
        title: "File uploaded successfully!",
        description: `Processing document: ${selectedFile.name} (Language: ${settings.languages})`,
      });

      const newDoc: UploadedDoc = {
        name: selectedFile.name,
        size: selectedFile.size,
        documentId: result.document_id,
        uploadedAt: new Date().toISOString(),
        status: 'processing',
        projectId: projectId
      };

      const updatedDocs = [...uploadedDocs, newDoc];
      setUploadedDocs(updatedDocs);
      localStorage.setItem(`project_${projectId}_docs`, JSON.stringify(updatedDocs));

      setSelectedFile(null);
      navigate(`/processing/${result.document_id}`);
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
          <div className="flex items-center gap-2 mb-8">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold gradient-text">ChunkSmith</h1>
          </div>
          
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Documents</h3>
            <span className="text-xs text-muted-foreground">{uploadedDocs.length}</span>
          </div>
          
          {uploadedDocs.length > 0 && (
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
                <button
                  key={`${doc.documentId}-${index}`}
                  onClick={() => handleDocClick(doc)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left group"
                >
                  <div className="relative">
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                    <div className="absolute -top-1 -right-1">
                      {getStatusIcon(doc.status)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate block">{doc.name}</span>
                      {getStatusBadge(doc.status)}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {(doc.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                </button>
              ))
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
                    <ChatInterface documentId={activeChatDoc} />
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
                      onClick={() => navigate('/')}
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
                  <Button className="gap-2" onClick={handleNewConversation}>
                    <Plus className="w-4 h-4" />
                    New conversation
                  </Button>
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
                    {conversations.map((conv, index) => (
                      <div key={index} className="glass-card p-4 hover:border-primary/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <MessageSquare className="w-5 h-5 text-primary" />
                          <span className="font-medium">{conv}</span>
                        </div>
                      </div>
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

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold">Sources</h4>
                    <span className="text-xs text-muted-foreground">{uploadedDocs.length}</span>
                  </div>
                  
                  {uploadedDocs.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      No sources added yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {uploadedDocs.map((doc, index) => (
                        <div 
                          key={`source-${doc.documentId}-${index}`}
                          onClick={() => handleDocClick(doc)}
                          className="glass-card p-3 text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <span className="flex-1 truncate">{doc.name}</span>
                            {getStatusIcon(doc.status)}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {(doc.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
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
                    navigate(`/processing/${selectedDoc.documentId}`);
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
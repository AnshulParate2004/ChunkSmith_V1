import { useState, useEffect } from 'react';
import { X, FileText, Search, Eye, Image, Table, Type, Loader2, AlertCircle, HelpCircle, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiService, DocumentChunk } from '@/services/api';

interface ViewDocumentsModalProps {
  fileName: string;
  documentId: string;
  projectId: string;
  onClose: () => void;
}

export const ViewDocumentsModal = ({ 
  fileName, 
  documentId,
  projectId,
  onClose 
}: ViewDocumentsModalProps) => {
  const [activeTab, setActiveTab] = useState('view-chunks');
  const [activeFilter, setActiveFilter] = useState<'all' | 'text' | 'image' | 'table'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChunk, setSelectedChunk] = useState<DocumentChunk | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileSizeKb, setFileSizeKb] = useState<number>(0);

  useEffect(() => {
    const fetchChunks = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiService.getDocumentChunks(projectId, documentId);
        if (response.success) {
          setChunks(response.chunks);
          setFileSizeKb(response.file_size_kb);
        } else {
          setError('Failed to load document chunks');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chunks');
      } finally {
        setLoading(false);
      }
    };

    if (documentId && projectId) {
      fetchChunks();
    }
  }, [documentId, projectId]);

  const getChunkTypes = (chunk: DocumentChunk): string[] => {
    return chunk.content_types || [];
  };

  const filteredChunks = chunks.filter(chunk => {
    const types = getChunkTypes(chunk);
    const matchesFilter = activeFilter === 'all' || types.includes(activeFilter);
    const matchesSearch = searchQuery === '' || 
      chunk.ai_summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chunk.original_text?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const tabs = [
    { id: 'view-chunks', name: 'View Chunks' },
  ];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return <Type className="w-3 h-3" />;
      case 'image': return <Image className="w-3 h-3" />;
      case 'table': return <Table className="w-3 h-3" />;
      default: return <FileText className="w-3 h-3" />;
    }
  };

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case 'text': return 'bg-success/20 text-success';
      case 'image': return 'bg-blue-500/20 text-blue-500';
      case 'table': return 'bg-orange-500/20 text-orange-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-6xl h-[90vh] glass-card flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{fileName}</h2>
              <p className="text-sm text-muted-foreground">
                {fileSizeKb > 0 ? `${fileSizeKb} KB • ` : ''}{chunks.length} chunks
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start px-6 pt-4 rounded-none border-b border-border bg-transparent h-auto flex-shrink-0">
            {tabs.map((tab) => (
              <TabsTrigger 
                key={tab.id} 
                value={tab.id}
                className="relative data-[state=active]:text-primary data-[state=active]:shadow-none pb-4"
              >
                {tab.name}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 flex overflow-hidden">
            {/* Main Content */}
            <div className="flex-1 overflow-hidden flex flex-col">
              <TabsContent value="view-chunks" className="h-full m-0 p-6 flex flex-col">
                {loading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Loading chunks...</span>
                  </div>
                ) : error ? (
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <AlertCircle className="w-12 h-12 text-destructive mb-4" />
                    <p className="text-destructive font-medium">{error}</p>
                    <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
                      Try Again
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="mb-6 flex-shrink-0">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-2xl font-semibold">Content Chunks</h3>
                        <span className="text-sm text-muted-foreground">
                          {filteredChunks.length} of {chunks.length} chunks
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="flex gap-2">
                          <Button 
                            variant={activeFilter === 'all' ? 'default' : 'outline'} 
                            size="sm"
                            onClick={() => setActiveFilter('all')}
                          >
                            All
                          </Button>
                          <Button 
                            variant={activeFilter === 'text' ? 'default' : 'outline'} 
                            size="sm"
                            onClick={() => setActiveFilter('text')}
                          >
                            <Type className="w-4 h-4 mr-1" />
                            Text
                          </Button>
                          <Button 
                            variant={activeFilter === 'image' ? 'default' : 'outline'} 
                            size="sm"
                            onClick={() => setActiveFilter('image')}
                          >
                            <Image className="w-4 h-4 mr-1" />
                            Image
                          </Button>
                          <Button 
                            variant={activeFilter === 'table' ? 'default' : 'outline'} 
                            size="sm"
                            onClick={() => setActiveFilter('table')}
                          >
                            <Table className="w-4 h-4 mr-1" />
                            Table
                          </Button>
                        </div>
                        <div className="flex-1 relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input 
                            type="text" 
                            placeholder="Search chunks..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-background/50"
                          />
                        </div>
                      </div>
                    </div>

                    <ScrollArea className="flex-1">
                      <div className="space-y-3 pr-4">
                        {filteredChunks.map((chunk) => (
                          <div 
                            key={chunk.chunk_index} 
                            className={`glass-card p-4 hover:border-primary/50 transition-colors cursor-pointer ${
                              selectedChunk?.chunk_index === chunk.chunk_index ? 'border-primary' : ''
                            }`}
                            onClick={() => setSelectedChunk(chunk)}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-primary">Chunk {chunk.chunk_index}</span>
                                {chunk.content_types?.map((type, idx) => (
                                  <span 
                                    key={idx}
                                    className={`px-2 py-1 text-xs rounded font-medium flex items-center gap-1 ${getTypeBadgeClass(type)}`}
                                  >
                                    {getTypeIcon(type)}
                                    {type}
                                  </span>
                                ))}
                                <span className="text-sm text-muted-foreground">
                                  Page {chunk.page_numbers?.join(', ')}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {chunk.original_text?.length || 0} chars
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {chunk.ai_summary || chunk.original_text?.substring(0, 200)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </>
                )}
              </TabsContent>

              {/* Placeholder content for other tabs */}
              {tabs.filter(t => t.id !== 'view-chunks').map((tab) => (
                <TabsContent key={tab.id} value={tab.id} className="h-full m-0 p-8">
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="text-center max-w-md">
                      <h3 className="text-2xl font-semibold mb-2">{tab.name}</h3>
                      <p className="text-muted-foreground">Step completed successfully</p>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </div>

            {/* Detail Inspector */}
            <div className="w-96 border-l border-border bg-card/30 backdrop-blur-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-border flex-shrink-0">
                <h3 className="text-lg font-semibold">Detail Inspector</h3>
              </div>
              <ScrollArea className="flex-1 p-4">
                {selectedChunk ? (
                  <div className="space-y-4">
                    {/* Chunk Info */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Chunk Index</span>
                        <span className="text-sm font-medium">{selectedChunk.chunk_index}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Page(s)</span>
                        <span className="text-sm font-medium">{selectedChunk.page_numbers?.join(', ')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Content Types</span>
                        <div className="flex gap-1">
                          {selectedChunk.content_types?.map((type, idx) => (
                            <span 
                              key={idx}
                              className={`px-2 py-0.5 text-xs rounded ${getTypeBadgeClass(type)}`}
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* AI Summary */}
                    {selectedChunk.ai_summary && selectedChunk.ai_summary !== '***DO NOT USE THIS SUMMARY***' && (
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <FileText className="w-4 h-4 text-primary" />
                          AI Summary
                        </h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {selectedChunk.ai_summary}
                        </p>
                      </div>
                    )}

                    {/* AI Questions */}
                    {selectedChunk.ai_questions && (
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <HelpCircle className="w-4 h-4 text-primary" />
                          Generated Questions
                        </h4>
                        <div className="text-sm text-muted-foreground space-y-1">
                          {selectedChunk.ai_questions.split('\n').filter(q => q.trim()).map((question, idx) => (
                            <p key={idx} className="pl-2 border-l-2 border-primary/30">
                              {question.replace(/^-\s*/, '')}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Image Interpretation */}
                    {selectedChunk.image_interpretation && 
                     selectedChunk.image_interpretation !== '***DO NOT USE THIS IMAGE***' && (
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Image className="w-4 h-4 text-blue-500" />
                          Image Analysis
                        </h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {selectedChunk.image_interpretation}
                        </p>
                      </div>
                    )}

                    {/* Table Interpretation - only show if there are actual tables */}
                    {selectedChunk.raw_tables_html && 
                     selectedChunk.raw_tables_html.length > 0 &&
                     selectedChunk.table_interpretation && 
                     selectedChunk.table_interpretation !== '***DO NOT USE THIS TABLE***' &&
                     !selectedChunk.table_interpretation.includes('***TABLE SUMMARY FAILED***') && (
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Table className="w-4 h-4 text-orange-500" />
                          Table Analysis
                        </h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {selectedChunk.table_interpretation}
                        </p>
                      </div>
                    )}

                    {/* Raw HTML Tables */}
                    {selectedChunk.raw_tables_html && selectedChunk.raw_tables_html.length > 0 && (
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Table className="w-4 h-4 text-orange-500" />
                          Tables ({selectedChunk.raw_tables_html.length})
                        </h4>
                        <div className="space-y-3">
                          {selectedChunk.raw_tables_html.map((tableHtml, idx) => (
                            <div 
                              key={idx} 
                              className="rounded-lg overflow-auto border border-border bg-background/50 p-2 text-sm [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs [&_td]:text-muted-foreground"
                              dangerouslySetInnerHTML={{ __html: tableHtml }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Images */}
                    {selectedChunk.images_base64 && selectedChunk.images_base64.length > 0 && (
                      <div className="pt-4 border-t border-border">
                        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Image className="w-4 h-4 text-blue-500" />
                          Images ({selectedChunk.images_base64.length})
                        </h4>
                        <div className="space-y-2">
                          {selectedChunk.images_base64.map((img, idx) => (
                            <div key={idx} className="rounded-lg overflow-hidden border border-border">
                              {img.data ? (
                                <img 
                                  src={img.data} 
                                  alt={img.filename}
                                  className="w-full h-auto"
                                />
                              ) : (
                                <div className="p-4 text-center text-muted-foreground text-sm">
                                  {img.error || 'Image not available'}
                                </div>
                              )}
                              <div className="p-2 bg-muted/30 text-xs text-muted-foreground">
                                {img.filename}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Original Text */}
                    <div className="pt-4 border-t border-border">
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <FileQuestion className="w-4 h-4 text-muted-foreground" />
                        Original Text
                      </h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto">
                        {selectedChunk.original_text}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Eye className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground text-center">
                      Select a chunk to inspect details
                    </p>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

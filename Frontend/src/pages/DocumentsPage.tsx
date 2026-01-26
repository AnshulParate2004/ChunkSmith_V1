import { useState, useEffect } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiService } from '@/services/api';
import { toast } from 'sonner';

const DocumentsPage = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const response = await apiService.getDocuments();
      setDocuments(response.documents || []);
    } catch (error: any) {
      toast.error('Failed to load documents');
      console.error('Load error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (documentId: string) => {
    try {
      await apiService.downloadDocument(documentId);
      toast.success('Download started');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const handleDownloadAll = async () => {
    try {
      // No project-specific download - download all data
      await apiService.downloadAllData();
      toast.success('Downloading all documents');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-5xl font-bold text-foreground">Documents</h2>
            <p className="text-lg text-muted-foreground mt-3">
              Manage your processed documents
            </p>
          </div>
          {documents.length > 0 && (
            <Button onClick={handleDownloadAll}>
              <Download className="w-4 h-4 mr-2" />
              Download All
            </Button>
          )}
        </div>

        {documents.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Documents Yet</h3>
            <p className="text-muted-foreground">
              Upload and process your first PDF to get started
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc) => (
              <div key={doc.document_id} className="glass-card p-6 space-y-4 hover-lift">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <FileText className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-foreground">{doc.document_id}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Chunks:</span>
                    <span className="font-medium">{doc.chunks_processed}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Images:</span>
                    <span className="font-medium">{doc.images_extracted}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Processing Time:</span>
                    <span className="font-medium">{doc.processing_time}s</span>
                  </div>
                </div>

                <Button
                  onClick={() => handleDownload(doc.document_id)}
                  variant="outline"
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentsPage;

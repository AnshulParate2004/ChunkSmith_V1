import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileUpload } from '@/components/Upload/FileUpload';
import { UploadSettings } from '@/components/Upload/UploadSettings';
import { Button } from '@/components/ui/button';
import { ProcessSettings, apiService } from '@/services/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const UploadPage = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [settings, setSettings] = useState<ProcessSettings>({
    languages: 'eng',
    extractImages: true,
    extractTables: true,
    maxCharacters: 3000,
    newAfterNChars: 3800,
    combineTextUnderNChars: 200,
  });

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    if (!projectId) {
      toast.error('Project ID is missing');
      navigate('/dashboard');
      return;
    }

    const docId = `${Date.now()}_${selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    setSelectedFile(null);
    setIsUploading(false);

    // Navigate immediately to processing window so the user sees live progress!
    navigate(`/processing/${docId}?projectId=${projectId}`);

    apiService.uploadPDF(selectedFile, settings, projectId, docId)
      .then((response) => {
        if (response && response.document_id) {
          localStorage.setItem(`processing_${response.document_id}`, JSON.stringify({
            documentId: response.document_id,
            result: {
              chunks_processed: response.chunks_count || 0,
              images_extracted: 0
            },
            processingTime: 5,
            completedAt: new Date().toISOString()
          }));
        }
      })
      .catch((error: any) => {
        toast.error(error.message || 'Upload failed');
        console.error('Upload error:', error);
      });
  };

  return (
    <div className="h-screen overflow-y-auto bg-background">
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="space-y-8 animate-fade-in">
          <div className="text-center space-y-3 mb-12">
            <h2 className="text-5xl font-bold text-foreground">Upload PDF Document</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Process your PDFs with advanced MultiModal RAG technology
            </p>
          </div>

          <FileUpload
            onFileSelect={setSelectedFile}
            selectedFile={selectedFile}
            onClearFile={() => setSelectedFile(null)}
          />

          <UploadSettings settings={settings} onSettingsChange={setSettings} />

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading}
            className="w-full h-12 text-base"
            size="lg"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Starting Upload...
              </>
            ) : (
              'Start Processing'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUpload } from '@/components/Upload/FileUpload';
import { UploadSettings } from '@/components/Upload/UploadSettings';
import { Button } from '@/components/ui/button';
import { ProcessSettings, apiService } from '@/services/api';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const UploadPage = () => {
  const navigate = useNavigate();
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

    const currentProjectId = localStorage.getItem('currentProjectId');
    if (!currentProjectId) {
      toast.error('Please select a project first');
      navigate('/');
      return;
    }

    setIsUploading(true);
    try {
      // Now passes project_id to the API
      const response = await apiService.uploadPDF(selectedFile, settings, currentProjectId);
      toast.success('Upload started successfully');

      // Attach this document to the currently selected project
      const projectDocsKey = `project_${currentProjectId}_docs`;
      const existingDocs = JSON.parse(localStorage.getItem(projectDocsKey) || '[]');
      const newDoc = {
        name: selectedFile.name,
        size: selectedFile.size,
        documentId: response.document_id,
        uploadedAt: new Date().toISOString(),
        status: 'processing',
        projectId: currentProjectId,
      };
      const updatedDocs = [...existingDocs, newDoc];
      localStorage.setItem(projectDocsKey, JSON.stringify(updatedDocs));

      // Map document → project for reliable "Back to Project" behavior
      localStorage.setItem(`doc_${response.document_id}_project`, currentProjectId);

      navigate(`/processing/${response.document_id}`);
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
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

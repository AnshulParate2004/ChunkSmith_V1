import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSSE } from '@/hooks/useSSE';
import { StepIndicator } from '@/components/Processing/StepIndicator';
import { ProgressBar } from '@/components/Processing/ProgressBar';
import { StatusMessage } from '@/components/Processing/StatusMessage';
import { ConnectionStatus } from '@/components/Processing/ConnectionStatus';
import { ViewDocumentsModal } from '@/components/Processing/ViewDocumentsModal';
import { Button } from '@/components/ui/button';
import { Download, Eye, ArrowLeft, MessageSquare } from 'lucide-react';
import { apiService } from '@/services/api';
import { toast } from 'sonner';

interface SavedProcessingData {
  documentId: string;
  result: any;
  processingTime: number;
  completedAt: string;
}

const ProcessingPage = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  
  // Check if we have saved data for this document
  const [hasSavedData, setHasSavedData] = useState(false);
  const [savedData, setSavedData] = useState<SavedProcessingData | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  
  const { messages, connected, error } = useSSE(hasSavedData ? null : (documentId || null));
  
  const [currentStep, setCurrentStep] = useState(1);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Initializing...');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error' | 'loading'>('loading');
  const [isComplete, setIsComplete] = useState(false);
  const [processingTime, setProcessingTime] = useState(0);
  const [result, setResult] = useState<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved data on mount
  useEffect(() => {
    if (documentId) {
      const saved = localStorage.getItem(`processing_${documentId}`);
      if (saved) {
        const data: SavedProcessingData = JSON.parse(saved);
        setSavedData(data);
        setHasSavedData(true);
        setIsComplete(true);
        setProgress(100);
        setResult(data.result);
        setProcessingTime(data.processingTime);
        setStatusMessage('Processing complete!');
        setStatusType('success');
        setCurrentStep(4);
      }
    }
  }, [documentId]);

  // Timer that stops when complete
  useEffect(() => {
    if (hasSavedData) return; // Don't start timer if we have saved data
    
    timerRef.current = setInterval(() => {
      setProcessingTime((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hasSavedData]);

  // Stop timer when complete
  useEffect(() => {
    if (isComplete && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [isComplete]);

  useEffect(() => {
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];

    switch (lastMessage.type) {
      case 'connected':
        setStatusMessage(lastMessage.data.message || 'Connected to processing stream');
        setStatusType('info');
        break;

      case 'progress':
        if (lastMessage.data.step) {
          setCurrentStep(lastMessage.data.step);
        }
        if (lastMessage.data.progress) {
          setProgress(lastMessage.data.progress);
        }
        if (lastMessage.data.message) {
          setStatusMessage(lastMessage.data.message);
        }
        setStatusType('loading');
        break;

      case 'complete':
        setProgress(100);
        setStatusMessage(lastMessage.data.message || 'Processing complete!');
        setStatusType('success');
        setIsComplete(true);
        setResult(lastMessage.data.result);
        // Save to localStorage for persistence
        if (documentId && lastMessage.data.result) {
          const dataToSave: SavedProcessingData = {
            documentId,
            result: lastMessage.data.result,
            processingTime,
            completedAt: new Date().toISOString()
          };
          localStorage.setItem(`processing_${documentId}`, JSON.stringify(dataToSave));
        }
        toast.success('Processing completed successfully!');
        break;

      case 'error':
        setStatusMessage(lastMessage.data.message || 'An error occurred');
        setStatusType('error');
        toast.error('Processing failed');
        break;
    }
  }, [messages]);

  const handleDownload = async () => {
    try {
      await apiService.downloadAllData();
      toast.success('Download started');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleBack = () => {
    // Try to find which project this document belongs to
    const projects = JSON.parse(localStorage.getItem('projects') || '[]');
    for (const project of projects) {
      const docs = JSON.parse(localStorage.getItem(`project_${project.id}_docs`) || '[]');
      if (docs.some((doc: any) => doc.documentId === documentId)) {
        // Persist the current project so future uploads are correctly attached
        localStorage.setItem('currentProjectId', project.id);
        navigate(`/project/${project.id}`);
        return;
      }
    }
    // Fallback to project 1 if not found
    navigate('/project/1');
  };

  return (
    <>
      {showViewModal && (
        <ViewDocumentsModal
          fileName={`Document-${documentId}.pdf`}
          documentId={documentId || ''}
          projectId={localStorage.getItem('currentProjectId') || ''}
          onClose={() => setShowViewModal(false)}
        />
      )}
      
      <div className="container mx-auto px-6 py-8 max-w-5xl">
        <div className="space-y-8 animate-fade-in">
          <Button variant="ghost" onClick={handleBack} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Project
          </Button>
          
          <div className="glass-card p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-bold text-foreground">
                  {isComplete ? 'Document Processed' : 'Processing Document'}
                </h2>
                <p className="text-sm text-muted-foreground mt-2">Document ID: {documentId}</p>
              </div>
              {!hasSavedData && <ConnectionStatus connected={connected} error={error} />}
            </div>

            <div className="space-y-6">
              <StepIndicator currentStep={currentStep} />
              <ProgressBar progress={progress} />
              <StatusMessage message={statusMessage} type={statusType} />

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">Processing Time:</span>
                <span className="text-lg font-bold">{formatTime(processingTime)}</span>
              </div>
            </div>
          </div>

          {isComplete && result && (
            <div className="glass-card p-6 space-y-4">
              <h3 className="text-xl font-bold">Processing Complete</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-primary/10 rounded-lg">
                  <p className="text-sm text-muted-foreground">Chunks Processed</p>
                  <p className="text-2xl font-bold text-primary">
                    {result.chunks_processed || 0}
                  </p>
                </div>
                <div className="p-4 bg-yellow-500/10 rounded-lg">
                  <p className="text-sm text-muted-foreground">Images Processed</p>
                  <p className="text-2xl font-bold text-yellow-500">
                    {result.images_extracted || 0}
                  </p>
                </div>
                <div className="p-4 bg-success/10 rounded-lg">
                  <p className="text-sm text-muted-foreground">Processing Time</p>
                  <p className="text-2xl font-bold text-success">
                    {formatTime(processingTime)}
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <Button onClick={handleDownload} variant="outline" className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  Download Data
                </Button>
                <Button onClick={() => setShowViewModal(true)} variant="outline" className="flex-1">
                  <Eye className="w-4 h-4 mr-2" />
                  View Documents
                </Button>
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-lg font-semibold mb-4">Processing Logs</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className="p-3 bg-muted/50 rounded text-sm font-mono"
                  >
                    <span className="text-muted-foreground">
                      [{new Date().toLocaleTimeString()}]
                    </span>{' '}
                    {msg.data.message || JSON.stringify(msg.data)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ProcessingPage;
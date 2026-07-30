import { X, FileText, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2 } from 'lucide-react';

interface ProcessingStep {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'completed';
  progress?: number;
  data?: any;
}

interface ProcessingModalProps {
  fileName: string;
  steps: ProcessingStep[];
  onClose: () => void;
}

export const ProcessingModal = ({ fileName, steps, onClose }: ProcessingModalProps) => {
  const activeStep = steps.find(s => s.status === 'active') || steps[0];

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
              <p className="text-sm text-muted-foreground">Processing Pipeline</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeStep.id} className="flex-1 flex flex-col">
          <TabsList className="w-full justify-start px-6 pt-4 rounded-none border-b border-border bg-transparent">
            {steps.map((step) => (
              <TabsTrigger 
                key={step.id} 
                value={step.id}
                className="relative data-[state=active]:text-primary data-[state=active]:shadow-none"
                disabled={step.status === 'pending'}
              >
                {step.name}
                {step.status === 'active' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 flex overflow-hidden">
            {/* Main Content */}
            <div className="flex-1 overflow-auto">
              {steps.map((step) => (
                <TabsContent 
                  key={step.id} 
                  value={step.id} 
                  className="h-full m-0 p-8"
                >
                  {step.id === 'upload' && (
                    <StepUpload data={step.data} status={step.status} />
                  )}
                  {step.id === 'queued' && (
                    <StepQueued data={step.data} status={step.status} />
                  )}
                  {step.id === 'partitioning' && (
                    <StepPartitioning data={step.data} status={step.status} />
                  )}
                  {step.id === 'chunking' && (
                    <StepChunking data={step.data} status={step.status} />
                  )}
                  {step.id === 'summarisation' && (
                    <StepSummarisation data={step.data} status={step.status} progress={step.progress} />
                  )}
                  {step.id === 'vectorization' && (
                    <StepVectorization data={step.data} status={step.status} />
                  )}
                  {step.id === 'chunks' && (
                    <StepChunks data={step.data} status={step.status} />
                  )}
                </TabsContent>
              ))}
            </div>

            {/* Detail Inspector */}
            <div className="w-80 border-l border-border bg-card/30 backdrop-blur-sm p-6">
              <h3 className="text-lg font-semibold mb-4">Detail Inspector</h3>
              <div className="space-y-4">
                {activeStep.status === 'completed' && (
                  <div className="flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Step completed successfully</span>
                  </div>
                )}
                {activeStep.id === 'chunks' && (
                  <p className="text-sm text-muted-foreground">
                    Select a chunk to inspect details
                  </p>
                )}
              </div>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

// Step Components
const StepUpload = ({ data, status }: any) => (
  <div className="flex flex-col items-center justify-center h-full">
    <div className="text-center max-w-md">
      <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-10 h-10 text-success" />
      </div>
      <h3 className="text-2xl font-semibold mb-2">Upload to S3</h3>
      <p className="text-muted-foreground mb-6">Uploading file to secure cloud storage</p>
      
      <div className="glass-card p-4 bg-success/10 border-success/50">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">Step completed successfully</span>
        </div>
      </div>
    </div>
  </div>
);

const StepQueued = ({ data, status }: any) => (
  <div className="flex flex-col items-center justify-center h-full">
    <div className="text-center max-w-md">
      <h3 className="text-2xl font-semibold mb-2">Queued</h3>
      <p className="text-muted-foreground">Document is queued for processing</p>
    </div>
  </div>
);

const StepPartitioning = ({ data, status }: any) => (
  <div className="flex flex-col items-center justify-center h-full">
    <div className="text-center max-w-2xl">
      <h3 className="text-2xl font-semibold mb-2">Partitioning</h3>
      <p className="text-muted-foreground mb-8">Processing and extracting text, images, and tables</p>
      
      {status === 'completed' && data && (
        <>
          <div className="glass-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <span className="text-lg">📊 Elements Discovered</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background/50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Text sections</span>
                  <span className="text-2xl font-bold">{data.textSections || 166}</span>
                </div>
              </div>
              <div className="bg-background/50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tables</span>
                  <span className="text-2xl font-bold">{data.tables || 4}</span>
                </div>
              </div>
              <div className="bg-background/50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Images</span>
                  <span className="text-2xl font-bold">{data.images || 7}</span>
                </div>
              </div>
              <div className="bg-background/50 p-4 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Titles/Headers</span>
                  <span className="text-2xl font-bold">{data.titles || 30}</span>
                </div>
              </div>
              <div className="bg-background/50 p-4 rounded-lg col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Other elements</span>
                  <span className="text-2xl font-bold">{data.other || 13}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card p-4 bg-success/10 border-success/50">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Step completed successfully</span>
            </div>
          </div>
        </>
      )}
    </div>
  </div>
);

const StepChunking = ({ data, status }: any) => (
  <div className="flex flex-col items-center justify-center h-full">
    <div className="text-center max-w-md">
      <h3 className="text-2xl font-semibold mb-2">Chunking</h3>
      <p className="text-muted-foreground mb-8">Creating semantic chunks</p>
      
      {status === 'completed' && data && (
        <>
          <div className="glass-card p-6 mb-6">
            <div className="flex items-center gap-2 mb-4 text-success">
              <span className="text-lg">Chunking Results</span>
            </div>
            <div className="bg-background/50 p-6 rounded-lg mb-4">
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <div className="text-4xl font-bold mb-1">{data.atomicElements || 220}</div>
                  <div className="text-sm text-muted-foreground">atomic elements</div>
                </div>
                <div className="text-3xl text-success">→</div>
                <div className="text-center">
                  <div className="text-4xl font-bold text-success mb-1">{data.chunks || 25}</div>
                  <div className="text-sm text-muted-foreground">chunks created</div>
                </div>
              </div>
            </div>
            <div className="bg-background/50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Average chunk size</span>
                <span className="font-medium">{data.avgSize || 0} characters</span>
              </div>
            </div>
            <p className="text-xs text-success mt-4">
              {data.atomicElements || 220} atomic elements have been chunked by title to produce {data.chunks || 25} chunks
            </p>
          </div>

          <div className="glass-card p-4 bg-success/10 border-success/50">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Step completed successfully</span>
            </div>
          </div>
        </>
      )}
    </div>
  </div>
);

const StepSummarisation = ({ data, status, progress }: any) => (
  <div className="flex flex-col items-center justify-center h-full">
    <div className="text-center max-w-md w-full">
      <h3 className="text-2xl font-semibold mb-2">Summarisation</h3>
      <p className="text-muted-foreground mb-8">Enhancing content with AI summaries for images and tables</p>
      
      <div className="glass-card p-6 mb-6">
        <div className="flex items-center gap-2 mb-4 text-primary">
          <span className="text-lg">🤖 AI Summarising Progress</span>
        </div>
        <div className="bg-background/50 p-8 rounded-lg mb-4">
          <div className="text-center mb-4">
            <span className="text-5xl font-bold text-primary">{data?.current || 20}</span>
            <span className="text-3xl text-muted-foreground"> / {data?.total || 25}</span>
          </div>
          <div className="text-sm text-muted-foreground">chunks processed</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Processing chunks and creating AI summaries for images and tables
        </p>
      </div>

      {status === 'active' && (
        <div className="glass-card p-4 bg-primary/10 border-primary/50">
          <div className="flex items-center gap-2 text-primary">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span className="font-medium">Processing...</span>
          </div>
        </div>
      )}
    </div>
  </div>
);

const StepVectorization = ({ data, status }: any) => (
  <div className="flex flex-col items-center justify-center h-full">
    <div className="text-center max-w-md">
      <div className="w-20 h-20 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-10 h-10 text-success" />
      </div>
      <h3 className="text-2xl font-semibold mb-2">Vectorization & Storage</h3>
      <p className="text-muted-foreground mb-6">Generating embeddings and storing in vector database</p>
      
      <div className="glass-card p-4 bg-success/10 border-success/50">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">Step completed successfully</span>
        </div>
      </div>
    </div>
  </div>
);

const StepChunks = ({ data, status }: any) => (
  <div className="h-full flex flex-col">
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-2xl font-semibold">Content Chunks</h3>
        <span className="text-sm text-muted-foreground">
          {data?.chunks?.length || 25} of {data?.chunks?.length || 25} chunks
        </span>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          <Button variant="default" size="sm">All</Button>
          <Button variant="outline" size="sm">Text</Button>
          <Button variant="outline" size="sm">Image</Button>
          <Button variant="outline" size="sm">Table</Button>
        </div>
        <div className="flex-1 relative">
          <input 
            type="text" 
            placeholder="Search chunks..." 
            className="w-full px-4 py-2 bg-background/50 border border-border rounded-lg"
          />
        </div>
      </div>
    </div>

    <div className="flex-1 overflow-auto space-y-3">
      {[...Array(25)].map((_, i) => (
        <div key={i} className="glass-card p-4 hover:border-primary/50 transition-colors cursor-pointer">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-1 text-xs rounded bg-success/20 text-success font-medium">text</span>
              <span className="text-sm text-muted-foreground">Page {i % 3 + 1}</span>
            </div>
            <span className="text-xs text-muted-foreground">{Math.floor(Math.random() * 3000) + 500} chars</span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore...
          </p>
        </div>
      ))}
    </div>
  </div>
);

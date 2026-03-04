import { Check, Loader2, Search, BookOpen, Pencil, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StreamingStep {
  id: string;
  type: 'planning' | 'searching' | 'reading' | 'writing' | 'images' | 'web';
  label: string;
  status: 'pending' | 'active' | 'complete';
  details?: string[];
}

interface StreamingStepsProps {
  steps: StreamingStep[];
}

export const StreamingSteps = ({ steps }: StreamingStepsProps) => {
  if (steps.length === 0) return null;

  const getIcon = (type: StreamingStep['type'], status: StreamingStep['status']) => {
    const iconClass = cn(
      'w-4 h-4',
      status === 'active' && 'animate-spin text-primary',
      status === 'complete' && 'text-primary',
      status === 'pending' && 'text-muted-foreground'
    );

    if (status === 'active') {
      return <Loader2 className={iconClass} />;
    }

    if (status === 'complete') {
      return <Check className={iconClass} />;
    }

    switch (type) {
      case 'planning':
        return <Search className={iconClass} />;
      case 'searching':
        return <Search className={iconClass} />;
      case 'reading':
        return <BookOpen className={iconClass} />;
      case 'writing':
        return <Pencil className={iconClass} />;
      case 'images':
        return <ImageIcon className={iconClass} />;
      default:
        return <Loader2 className={iconClass} />;
    }
  };

  return (
    <div className="space-y-3 mb-4">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-start gap-3">
          {/* Timeline indicator */}
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center border-2 transition-colors',
                step.status === 'complete' && 'bg-primary/10 border-primary',
                step.status === 'active' && 'bg-primary/5 border-primary',
                step.status === 'pending' && 'bg-muted border-border'
              )}
            >
              {getIcon(step.type, step.status)}
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'w-0.5 h-8 mt-1 transition-colors',
                  step.status === 'complete' ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </div>

          {/* Step content */}
          <div className="flex-1 pt-0.5">
            <p
              className={cn(
                'text-sm font-medium transition-colors',
                step.status === 'complete' && 'text-foreground',
                step.status === 'active' && 'text-primary',
                step.status === 'pending' && 'text-muted-foreground'
              )}
            >
              {step.label}
            </p>

            {/* Details (like search queries or sources) */}
            {step.details && step.details.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {step.details.map((detail, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center px-2.5 py-1 rounded-md bg-muted text-xs text-muted-foreground border border-border"
                  >
                    {step.type === 'searching' && <Search className="w-3 h-3 mr-1.5" />}
                    {step.type === 'reading' && <BookOpen className="w-3 h-3 mr-1.5" />}
                    <span className="truncate max-w-[200px]">{detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

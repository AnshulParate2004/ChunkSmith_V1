import { Upload, FileSearch, Brain, Database, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  currentStep: number;
}

const steps = [
  { number: 1, name: 'Upload', icon: Upload, range: [0, 25] },
  { number: 2, name: 'Parse', icon: FileSearch, range: [25, 40] },
  { number: 3, name: 'AI Process', icon: Brain, range: [40, 80] },
  { number: 4, name: 'Vectorize', icon: Database, range: [80, 100] },
];

export const StepIndicator = ({ currentStep }: StepIndicatorProps) => {
  return (
    <div className="flex justify-between items-center">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = currentStep >= step.number;
        const isCompleted = currentStep > step.number;

        return (
          <div key={step.number} className="flex flex-col items-center flex-1">
            <div className="relative flex items-center w-full">
              {index > 0 && (
                <div
                  className={cn(
                    'h-1 flex-1 transition-all duration-500',
                    isActive ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}
              <div
                className={cn(
                  'relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-300',
                  isCompleted
                    ? 'bg-success border-success'
                    : isActive
                    ? 'bg-primary border-primary'
                    : 'bg-white border-border'
                )}
              >
                {isCompleted ? (
                  <Check className="w-6 h-6 text-white" />
                ) : (
                  <Icon
                    className={cn(
                      'w-6 h-6 transition-colors',
                      isActive ? 'text-white' : 'text-muted-foreground'
                    )}
                  />
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'h-1 flex-1 transition-all duration-500',
                    isActive ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}
            </div>
            <p
              className={cn(
                'mt-2 text-sm font-medium transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {step.name}
            </p>
          </div>
        );
      })}
    </div>
  );
};

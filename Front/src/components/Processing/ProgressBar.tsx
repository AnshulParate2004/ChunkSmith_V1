import { Progress } from '@/components/ui/progress';

interface ProgressBarProps {
  progress: number;
}

export const ProgressBar = ({ progress }: ProgressBarProps) => {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Processing</span>
        <span className="font-semibold">{progress}%</span>
      </div>
      <Progress value={progress} className="h-3" />
    </div>
  );
};

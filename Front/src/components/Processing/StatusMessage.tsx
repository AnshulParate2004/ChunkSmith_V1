import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusMessageProps {
  message: string;
  type: 'info' | 'success' | 'error' | 'loading';
}

export const StatusMessage = ({ message, type }: StatusMessageProps) => {
  const icons = {
    info: AlertCircle,
    success: CheckCircle2,
    error: AlertCircle,
    loading: Loader2,
  };

  const Icon = icons[type];

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-4 rounded-lg border',
        type === 'success' && 'bg-success/10 border-success text-success-foreground',
        type === 'error' && 'bg-destructive/10 border-destructive text-destructive-foreground',
        type === 'info' && 'bg-primary/10 border-primary text-primary',
        type === 'loading' && 'bg-primary/10 border-primary text-primary'
      )}
    >
      <Icon className={cn('w-5 h-5', type === 'loading' && 'animate-spin')} />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
};

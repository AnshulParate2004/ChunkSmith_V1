import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  connected: boolean;
  error?: string | null;
}

export const ConnectionStatus = ({ connected, error }: ConnectionStatusProps) => {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'w-3 h-3 rounded-full transition-colors',
          connected ? 'bg-success animate-pulse' : 'bg-destructive'
        )}
      />
      <span className="text-sm font-medium">
        {connected ? 'Connected' : error || 'Disconnected'}
      </span>
    </div>
  );
};

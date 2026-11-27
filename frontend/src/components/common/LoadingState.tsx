import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingStateProps {
  label?: string;
  description?: string;
  className?: string;
}

export function LoadingState({
  label = 'Loading data from verification backend…',
  description,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-[#E5DCD3] bg-[#FFFCF8] px-6 py-10 text-center',
        className,
      )}
    >
      <Loader2 className="h-6 w-6 animate-spin text-[#702B3A]" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-[#30282A]">{label}</p>
      {description && <p className="mt-1 max-w-md text-xs text-[#827875]">{description}</p>}
    </div>
  );
}

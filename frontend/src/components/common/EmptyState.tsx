import React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-[#E5DCD3] bg-[#FFFCF8] px-6 py-10 text-center',
        className,
      )}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5DCD3] bg-[#F1EAE2] text-[#702B3A]">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden="true" />}
      </div>
      <h3 className="text-base font-semibold text-[#30282A]">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-[#827875]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

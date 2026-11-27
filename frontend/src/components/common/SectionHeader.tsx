import React from 'react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-2 border-b border-[#EFE9E1] pb-3 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div>
        {kicker && (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#702B3A]">
            {kicker}
          </p>
        )}
        <h2 className="font-serif-display text-2xl leading-snug text-[#30282A]">{title}</h2>
        {description && (
          <p className="mt-1 max-w-3xl text-sm text-[#51494A]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

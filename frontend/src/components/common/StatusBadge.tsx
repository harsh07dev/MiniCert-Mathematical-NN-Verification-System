import { cn } from '@/lib/utils';

const STATUS_STYLE_MAP: Record<string, { text: string; bg: string; border: string; label: string }> = {
  CERTIFIED: {
    text: 'text-[#1E7A34]',
    bg: 'bg-[#1E7A34]/8',
    border: 'border-[#1E7A34]',
    label: 'CERTIFIED',
  },
  COMPLETED: {
    text: 'text-[#1E7A34]',
    bg: 'bg-[#1E7A34]/8',
    border: 'border-[#1E7A34]',
    label: 'Completed',
  },
  TIGHTENED: {
    text: 'text-[#1E7A34]',
    bg: 'bg-[#1E7A34]/8',
    border: 'border-[#1E7A34]',
    label: 'TIGHTENED',
  },
  EQUIVALENT: {
    text: 'text-[#1E7A34]',
    bg: 'bg-[#1E7A34]/8',
    border: 'border-[#1E7A34]',
    label: 'Equivalent',
  },
  INCONCLUSIVE: {
    text: 'text-[#9A6700]',
    bg: 'bg-[#9A6700]/8',
    border: 'border-[#9A6700]',
    label: 'INCONCLUSIVE',
  },
  INCOMPLETE: {
    text: 'text-[#9A6700]',
    bg: 'bg-[#9A6700]/8',
    border: 'border-[#9A6700]',
    label: 'Incomplete',
  },
  ERROR: {
    text: 'text-[#B3261E]',
    bg: 'bg-[#B3261E]/8',
    border: 'border-[#B3261E]',
    label: 'ERROR',
  },
  FAILED: {
    text: 'text-[#B3261E]',
    bg: 'bg-[#B3261E]/8',
    border: 'border-[#B3261E]',
    label: 'Failed',
  },
  CORRUPTED: {
    text: 'text-[#B3261E]',
    bg: 'bg-[#B3261E]/8',
    border: 'border-[#B3261E]',
    label: 'Corrupted',
  },
  UNCHANGED: {
    text: 'text-[#51494A]',
    bg: 'bg-[#51494A]/8',
    border: 'border-[#827875]',
    label: 'UNCHANGED',
  },
};

interface StatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = (status ?? '').trim().toUpperCase();
  const style = STATUS_STYLE_MAP[key] ?? {
    text: 'text-[#51494A]',
    bg: 'bg-[#51494A]/8',
    border: 'border-[#827875]',
    label: status ? status : 'NOT RUN',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]',
        style.text,
        style.bg,
        style.border,
        className,
      )}
    >
      {style.label}
    </span>
  );
}

import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: 'default' | 'positive' | 'warning' | 'muted';
  className?: string;
}

export function MetricCard({
  label,
  value,
  sublabel,
  tone = 'default',
  className,
}: MetricCardProps) {
  const valueColor =
    tone === 'positive'
      ? 'text-[#1E7A34]'
      : tone === 'warning'
        ? 'text-[#9A6700]'
        : tone === 'muted'
          ? 'text-[#51494A]'
          : 'text-[#702B3A]';

  return (
    <div
      className={cn(
        'rounded-xl border border-[#E5DCD3] bg-[#FFFCF8] px-4 py-3.5',
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#827875]">
        {label}
      </p>
      <p
        className={cn(
          'font-mono-tabular mt-1.5 text-2xl font-bold leading-none tracking-tight',
          valueColor,
        )}
      >
        {value}
      </p>
      {sublabel && <p className="mt-2 text-xs text-[#51494A]">{sublabel}</p>}
    </div>
  );
}

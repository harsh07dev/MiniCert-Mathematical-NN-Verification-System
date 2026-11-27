import { useMemo, useState } from 'react';
import { type ColumnDef, type VisibilityState } from '@tanstack/react-table';
import { Columns3, Filter } from 'lucide-react';
import type { SampleRecordDTO } from '@/api/types';
import { DataTable } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatOptionalNumber } from '@/lib/formatters';

interface SampleRecordsTableProps {
  records: SampleRecordDTO[];
  caption?: string;
}

const OPTIONAL_COLUMN_LABELS: Array<{ id: string; label: string; defaultVisible: boolean }> = [
  { id: 'target_class', label: 'Target Class', defaultVisible: false },
  { id: 'baseline_time_seconds', label: 'Baseline Time (s)', defaultVisible: true },
  { id: 'lp_refinement_time_seconds', label: 'LP Time (s)', defaultVisible: true },
  { id: 'refined_time_seconds', label: 'Total Refined Time (s)', defaultVisible: true },
  { id: 'refinement_status', label: 'Refinement Status', defaultVisible: false },
  { id: 'refinement_targets', label: 'LP Targets', defaultVisible: true },
  { id: 'refinement_accepted', label: 'LP Accepted', defaultVisible: true },
  { id: 'refinement_rejected', label: 'LP Rejected', defaultVisible: false },
  { id: 'baseline_width_mean', label: 'Baseline Width', defaultVisible: true },
  { id: 'refined_width_mean', label: 'Refined Width', defaultVisible: true },
  { id: 'abs_width_reduction_mean', label: 'Abs Width Red.', defaultVisible: false },
  { id: 'rel_width_reduction_mean', label: 'Rel Width Red.', defaultVisible: false },
  { id: 'zero_width_baseline_intervals', label: 'Zero-Width Coords', defaultVisible: false },
  { id: 'error', label: 'Error Detail', defaultVisible: true },
];

export function SampleRecordsTable({
  records,
  caption = 'Per-sample verification records',
}: SampleRecordsTableProps) {
  const [epsilonFilter, setEpsilonFilter] = useState<string>('ALL');
  const [baselineFilter, setBaselineFilter] = useState<string>('ALL');
  const [refinedFilter, setRefinedFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [visibility, setVisibility] = useState<VisibilityState>(() => {
    const initial: VisibilityState = {};
    for (const col of OPTIONAL_COLUMN_LABELS) {
      initial[col.id] = col.defaultVisible;
    }
    return initial;
  });

  const epsilonOptions = useMemo(() => {
    const set = new Set<number>();
    records.forEach((r) => set.add(r.epsilon));
    return Array.from(set).sort((a, b) => a - b);
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim();
    return records.filter((rec) => {
      if (epsilonFilter !== 'ALL' && String(rec.epsilon) !== epsilonFilter) {
        return false;
      }
      if (baselineFilter !== 'ALL' && rec.baseline_status !== baselineFilter) {
        return false;
      }
      if (refinedFilter !== 'ALL' && rec.refined_status !== refinedFilter) {
        return false;
      }
      if (q) {
        const matchesIdx = String(rec.sample_index).includes(q);
        const matchesLabel = String(rec.label) === q;
        const matchesPred = String(rec.predicted) === q;
        if (!matchesIdx && !matchesLabel && !matchesPred) {
          return false;
        }
      }
      return true;
    });
  }, [records, epsilonFilter, baselineFilter, refinedFilter, searchQuery]);

  const columns = useMemo<ColumnDef<SampleRecordDTO, unknown>[]>(
    () => [
      {
        accessorKey: 'sample_index',
        header: 'Sample #',
        cell: (info) => (
          <span className="font-mono-tabular font-semibold">{String(info.getValue())}</span>
        ),
      },
      {
        accessorKey: 'label',
        header: 'Label',
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
      {
        accessorKey: 'predicted',
        header: 'Pred',
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
      {
        accessorKey: 'target_class',
        header: 'Target',
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
      {
        accessorKey: 'epsilon',
        header: 'ε',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number, 6)}
          </span>
        ),
      },
      {
        accessorKey: 'baseline_status',
        header: 'Baseline',
        cell: (info) => <StatusBadge status={String(info.getValue())} />,
      },
      {
        accessorKey: 'baseline_margin',
        header: 'Base Margin',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        accessorKey: 'baseline_time_seconds',
        header: 'Base Time (s)',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        accessorKey: 'refined_status',
        header: 'Refined',
        cell: (info) => <StatusBadge status={String(info.getValue())} />,
      },
      {
        accessorKey: 'refined_margin',
        header: 'Ref Margin',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        accessorKey: 'lp_refinement_time_seconds',
        header: 'LP Time (s)',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        accessorKey: 'refined_time_seconds',
        header: 'Total Ref (s)',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        accessorKey: 'refinement_status',
        header: 'Refinement',
        cell: (info) => {
          const val = info.getValue() as string | null;
          return val ? <StatusBadge status={val} /> : <span className="text-[#827875]">—</span>;
        },
      },
      {
        accessorKey: 'refinement_targets',
        header: 'Targets',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null, 4)}
          </span>
        ),
      },
      {
        accessorKey: 'refinement_accepted',
        header: 'Accepted',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null, 4)}
          </span>
        ),
      },
      {
        accessorKey: 'refinement_rejected',
        header: 'Rejected',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null, 4)}
          </span>
        ),
      },
      {
        accessorKey: 'baseline_width_mean',
        header: 'Base Width',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        accessorKey: 'refined_width_mean',
        header: 'Ref Width',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        accessorKey: 'abs_width_reduction_mean',
        header: 'Abs Width Red.',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        accessorKey: 'rel_width_reduction_mean',
        header: 'Rel Width Red.',
        cell: (info) => {
          const val = info.getValue() as number | null;
          return (
            <span className="font-mono-tabular">
              {val === null || val === undefined ? '—' : `${(val * 100).toFixed(1)}%`}
            </span>
          );
        },
      },
      {
        accessorKey: 'zero_width_baseline_intervals',
        header: 'Zero-Width',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatOptionalNumber(info.getValue() as number | null, 4)}
          </span>
        ),
      },
      {
        accessorKey: 'error',
        header: 'Error',
        cell: (info) => {
          const val = info.getValue() as string | null;
          return val ? (
            <span className="max-w-xs truncate text-xs text-[#B3261E]" title={val}>
              {val}
            </span>
          ) : (
            <span className="text-[#827875]">—</span>
          );
        },
      },
    ],
    [],
  );

  const toggleColumn = (id: string) => {
    setVisibility((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? true),
    }));
  };

  return (
    <div className="space-y-3">
      {/* Filter & Column Visibility Toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[#E5DCD3] bg-[#FFFCF8] p-3.5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-1.5 self-center text-xs font-semibold uppercase tracking-[0.06em] text-[#827875]">
            <Filter className="h-3.5 w-3.5 text-[#702B3A]" aria-hidden="true" />
            <span>Filters</span>
          </div>

          <label className="flex flex-col gap-1 text-xs text-[#51494A]">
            <span>Epsilon ε</span>
            <select
              value={epsilonFilter}
              onChange={(e) => setEpsilonFilter(e.target.value)}
              className="rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-2.5 py-1.5 font-mono-tabular text-xs text-[#30282A]"
            >
              <option value="ALL">All ({epsilonOptions.length})</option>
              {epsilonOptions.map((eps) => (
                <option key={eps} value={String(eps)}>
                  {eps}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-[#51494A]">
            <span>Baseline Verdict</span>
            <select
              value={baselineFilter}
              onChange={(e) => setBaselineFilter(e.target.value)}
              className="rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-2.5 py-1.5 text-xs text-[#30282A]"
            >
              <option value="ALL">All</option>
              <option value="CERTIFIED">CERTIFIED</option>
              <option value="INCONCLUSIVE">INCONCLUSIVE</option>
              <option value="ERROR">ERROR</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-[#51494A]">
            <span>Refined Verdict</span>
            <select
              value={refinedFilter}
              onChange={(e) => setRefinedFilter(e.target.value)}
              className="rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-2.5 py-1.5 text-xs text-[#30282A]"
            >
              <option value="ALL">All</option>
              <option value="CERTIFIED">CERTIFIED</option>
              <option value="INCONCLUSIVE">INCONCLUSIVE</option>
              <option value="ERROR">ERROR</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-[#51494A]">
            <span>Sample Index / Class</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. 3771 or 8"
              className="w-36 rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-2.5 py-1.5 font-mono-tabular text-xs text-[#30282A] placeholder:text-[#827875]"
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono-tabular text-xs text-[#827875]">
            {filteredRecords.length} / {records.length} records
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Columns</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              {OPTIONAL_COLUMN_LABELS.map((col) => {
                const checked = visibility[col.id] ?? col.defaultVisible;
                return (
                  <DropdownMenuItem
                    key={col.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      toggleColumn(col.id);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="h-3.5 w-3.5 accent-[#702B3A]"
                    />
                    <span>{col.label}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <DataTable
        data={filteredRecords}
        columns={columns}
        caption={caption}
        columnVisibility={visibility}
        paginate
        initialPageSize={25}
        compact
        emptyMessage="No verification records match the current filters."
      />
    </div>
  );
}

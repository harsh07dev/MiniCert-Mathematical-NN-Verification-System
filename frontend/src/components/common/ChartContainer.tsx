import React, { useMemo, useRef, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, Grid3X3, ListTree, Table2 } from 'lucide-react';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { ExportMenu, type ExportOption } from '@/components/common/ExportMenu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ChartRenderProps {
  showLegend: boolean;
  showGrid: boolean;
}

export interface ChartDataColumn {
  key: string;
  label: string;
  format?: (value: unknown) => string;
}

interface ChartContainerProps<TRow extends Record<string, unknown>> {
  id: string;
  title: string;
  description: string;
  unit?: string;
  data: TRow[];
  columns?: ChartDataColumn[];
  emptyMessage?: string;
  heightClassName?: string;
  children: (props: ChartRenderProps) => React.ReactNode;
  className?: string;
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ChartContainer<TRow extends Record<string, unknown>>({
  id,
  title,
  description,
  unit,
  data,
  columns,
  emptyMessage = 'No measurements available for this chart.',
  heightClassName = 'h-72',
  children,
  className,
}: ChartContainerProps<TRow>) {
  const [showLegend, setShowLegend] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showDataTable, setShowDataTable] = useState(false);
  const chartWrapperRef = useRef<HTMLDivElement>(null);

  const inferredColumns = useMemo<ChartDataColumn[]>(() => {
    if (columns && columns.length > 0) {
      return columns;
    }
    if (data.length === 0) {
      return [];
    }
    return Object.keys(data[0]).map((key) => ({ key, label: key }));
  }, [columns, data]);

  const tableColumns = useMemo<ColumnDef<TRow, unknown>[]>(
    () =>
      inferredColumns.map((col) => ({
        accessorKey: col.key,
        header: col.label,
        cell: (info) => {
          const val = info.getValue();
          if (col.format) {
            return <span className="font-mono-tabular">{col.format(val)}</span>;
          }
          if (val === null || val === undefined) {
            return <span className="font-mono-tabular text-[#827875]">—</span>;
          }
          return <span className="font-mono-tabular">{String(val)}</span>;
        },
      })),
    [inferredColumns],
  );

  const handleExportCsv = () => {
    if (inferredColumns.length === 0) {
      return;
    }
    const header = inferredColumns.map((c) => escapeCsvCell(c.key)).join(',');
    const rows = data.map((row) =>
      inferredColumns.map((c) => escapeCsvCell(row[c.key])).join(','),
    );
    const csvContent = [header, ...rows].join('\n');
    downloadBlob(
      new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
      `${id}_data.csv`,
    );
  };

  const handleExportPng = () => {
    const svg = chartWrapperRef.current?.querySelector('svg');
    if (!svg) {
      return;
    }
    const serializer = new XMLSerializer();
    const svgText = serializer.serializeToString(svg);
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const image = new window.Image();
    image.onload = () => {
      const rect = svg.getBoundingClientRect();
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFCF8';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(image, 0, 0, rect.width, rect.height);
        canvas.toBlob((pngBlob) => {
          if (pngBlob) {
            downloadBlob(pngBlob, `${id}.png`);
          }
          URL.revokeObjectURL(url);
        }, 'image/png');
      } else {
        URL.revokeObjectURL(url);
      }
    };
    image.src = url;
  };

  const exportOptions: ExportOption[] = [
    {
      id: 'png',
      label: 'Download PNG',
      kind: 'png',
      onSelect: handleExportPng,
      disabled: data.length === 0,
    },
    {
      id: 'csv',
      label: 'Download Chart Data (CSV)',
      kind: 'csv',
      onSelect: handleExportCsv,
      disabled: data.length === 0,
    },
  ];

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn('rounded-xl border border-[#E5DCD3] bg-[#FFFCF8] p-5', className)}
    >
      <div className="mb-4 flex flex-col gap-3 border-b border-[#EFE9E1] pb-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id={`${id}-title`} className="text-base font-semibold text-[#30282A]">
            {title}
            {unit ? (
              <span className="ml-1.5 text-xs font-medium text-[#827875]">({unit})</span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-[#51494A]">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant={showLegend ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={showLegend}
            onClick={() => setShowLegend((v) => !v)}
          >
            <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
            Legend
          </Button>
          <Button
            type="button"
            variant={showGrid ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={showGrid}
            onClick={() => setShowGrid((v) => !v)}
          >
            <Grid3X3 className="h-3.5 w-3.5" aria-hidden="true" />
            Grid
          </Button>
          <ExportMenu label="Export" options={exportOptions} disabled={data.length === 0} />
        </div>
      </div>

      {data.length === 0 ? (
        <EmptyState title="No Chart Data" description={emptyMessage} />
      ) : (
        <>
          <div ref={chartWrapperRef} className={cn('w-full', heightClassName)}>
            {children({ showLegend, showGrid })}
          </div>

          <div className="mt-4 border-t border-[#EFE9E1] pt-3">
            <button
              type="button"
              onClick={() => setShowDataTable((v) => !v)}
              aria-expanded={showDataTable}
              className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-[#51494A] hover:text-[#702B3A]"
            >
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Accessible Numerical Data ({data.length} rows)</span>
              {showDataTable ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            {showDataTable && (
              <div className="mt-3">
                <DataTable
                  data={data}
                  columns={tableColumns}
                  caption={`${title} numerical data table`}
                  compact
                />
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

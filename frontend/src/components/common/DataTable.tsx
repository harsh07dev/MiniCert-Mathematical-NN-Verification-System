import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  caption?: string;
  emptyMessage?: string;
  initialSorting?: SortingState;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;
  paginate?: boolean;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  onRowClick?: (row: TData) => void;
  isRowSelected?: (row: TData) => boolean;
  className?: string;
  compact?: boolean;
}

export function DataTable<TData>({
  data,
  columns,
  caption,
  emptyMessage = 'No records available.',
  initialSorting = [],
  columnVisibility,
  paginate = false,
  initialPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  onRowClick,
  isRowSelected,
  className,
  compact = false,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: initialPageSize,
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      ...(columnVisibility ? { columnVisibility } : {}),
      ...(paginate ? { pagination } : {}),
    },
    onSortingChange: setSorting,
    onPaginationChange: paginate ? setPagination : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(paginate ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });

  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-2.5';
  const rows = table.getRowModel().rows;
  const visibleColumnsCount = table.getVisibleLeafColumns().length || columns.length;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-[#E5DCD3] bg-[#FFFCF8]',
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="border-b border-[#E5DCD3] bg-[#F1EAE2]/70">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={cn(
                        cellPad,
                        'whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.06em] text-[#51494A]',
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex cursor-pointer items-center gap-1 hover:text-[#702B3A]"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3 w-3 text-[#702B3A]" aria-hidden="true" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3 w-3 text-[#702B3A]" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 text-[#827875]" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-[#EFE9E1]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnsCount}
                  className="px-4 py-8 text-center text-sm text-[#827875]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const selected = isRowSelected ? isRowSelected(row.original) : false;
                return (
                  <tr
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={cn(
                      'transition-colors',
                      onRowClick ? 'cursor-pointer' : '',
                      selected
                        ? 'bg-[#702B3A]/8'
                        : 'hover:bg-[#F7F3ED]/70',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(cellPad, 'whitespace-nowrap text-[#30282A]')}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {paginate && data.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5DCD3] bg-[#F7F3ED]/60 px-4 py-2.5 text-xs text-[#51494A]">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              aria-label="Rows per page"
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value));
              }}
              className="rounded-md border border-[#E5DCD3] bg-[#FFFCF8] px-2 py-1 font-mono-tabular text-xs text-[#30282A]"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="font-mono-tabular text-[#827875]">
              Showing {rows.length} of {data.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono-tabular">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {Math.max(1, table.getPageCount())}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

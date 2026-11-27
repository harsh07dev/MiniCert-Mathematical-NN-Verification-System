import { ChevronDown, Download, FileJson, FileSpreadsheet, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface ExportOption {
  id: string;
  label: string;
  kind: 'csv' | 'json' | 'png';
  href?: string;
  downloadName?: string;
  onSelect?: () => void;
  disabled?: boolean;
}

interface ExportMenuProps {
  label?: string;
  options: ExportOption[];
  disabled?: boolean;
}

function ExportIcon({ kind }: { kind: ExportOption['kind'] }) {
  if (kind === 'csv') {
    return <FileSpreadsheet className="h-4 w-4 text-[#627D68]" aria-hidden="true" />;
  }
  if (kind === 'json') {
    return <FileJson className="h-4 w-4 text-[#702B3A]" aria-hidden="true" />;
  }
  return <Image className="h-4 w-4 text-[#51494A]" aria-hidden="true" />;
}

export function ExportMenu({
  label = 'Export',
  options,
  disabled = false,
}: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled || options.length === 0}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{label}</span>
          <ChevronDown className="h-3.5 w-3.5 text-[#827875]" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((option) =>
          option.href ? (
            <DropdownMenuItem key={option.id} asChild disabled={option.disabled}>
              <a href={option.href} download={option.downloadName ?? true}>
                <ExportIcon kind={option.kind} />
                <span>{option.label}</span>
              </a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={option.id}
              disabled={option.disabled}
              onSelect={() => option.onSelect?.()}
            >
              <ExportIcon kind={option.kind} />
              <span>{option.label}</span>
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

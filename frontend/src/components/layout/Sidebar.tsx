import {
  BarChart3,
  BookOpen,
  FlaskConical,
  GitCompare,
  History,
  Microscope,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useWorkspace } from '@/context/WorkspaceContext';
import { cn } from '@/lib/utils';

export interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  phaseTag?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', to: '/', icon: BookOpen },
  { label: 'Individual Verification', to: '/verify', icon: Microscope },
  { label: 'New Experiment', to: '/experiments/new', icon: FlaskConical },
  { label: 'Experiment Results', to: '/experiments/results', icon: BarChart3 },
  { label: 'Experiment History', to: '/experiments/history', icon: History },
  { label: 'Experiment Comparison', to: '/experiments/compare', icon: GitCompare },
];

interface SidebarProps {
  onNavigate?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}

function formatDimensionSummary(
  architecture: ReturnType<typeof useWorkspace>['architecture'],
): string {
  if (!architecture) {
    return 'Loading from backend…';
  }
  const linearDims: number[] = [];
  architecture.sequence.forEach((layer) => {
    if (layer.type === 'linear' && layer.input_features !== null && layer.output_features !== null) {
      if (linearDims.length === 0) {
        linearDims.push(layer.input_features);
      }
      linearDims.push(layer.output_features);
    }
  });
  const dimsText =
    linearDims.length > 0
      ? linearDims.join(' → ')
      : `${architecture.input_features} → ${architecture.output_features}`;
  return `${dimsText} · ${architecture.num_linear_layers} Linear / ${architecture.num_sequence_layers} Ops`;
}

export function Sidebar({
  onNavigate,
  showCloseButton = false,
  onClose,
}: SidebarProps) {
  const { architecture, activeExperimentId, loading, error } = useWorkspace();

  return (
    <aside
      aria-label="MiniCert workspace navigation"
      className="flex h-full w-72 flex-col border-r border-[#E5DCD3] bg-[#F1EAE2] px-4 py-5"
    >
      {/* Brand Header */}
      <div className="mb-4 flex items-start justify-between border-b border-[#E5DCD3] pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#702B3A]">
            Formal Methods Research
          </p>
          <p className="font-serif-display mt-0.5 text-2xl leading-tight text-[#30282A]">
            MiniCert
          </p>
          <p className="text-xs text-[#827875]">Neural Network Robustness Verifier</p>
        </div>
        {showCloseButton && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="rounded-md p-1.5 text-[#51494A] hover:bg-[#E5DCD3]/60 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dynamic Verified Network Card */}
      <div className="mb-3 rounded-lg border border-[#E5DCD3] bg-[#FFFCF8] px-3.5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#827875]">
          Verified Network
        </p>
        <p className="mt-0.5 text-sm font-semibold text-[#30282A]">
          {architecture ? architecture.source_model : loading ? 'Connecting…' : 'Unavailable'}
        </p>
        <p className="font-mono-tabular mt-0.5 text-xs text-[#51494A]">
          {error ? 'Backend offline' : formatDimensionSummary(architecture)}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {['PyTorch', 'Float64', 'HiGHS LP', 'L4 Default'].map((tag) => (
            <span
              key={tag}
              className="rounded border border-[#E8DDD6] bg-[#F4ECE7] px-1.5 py-0.5 text-[10px] font-semibold text-[#702B3A]"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Active Benchmark Run Card */}
      <div className="mb-4 rounded-lg border border-[#E5DCD3] bg-[#FFFCF8] px-3.5 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#827875]">
          Active Benchmark Run
        </p>
        <p className="font-mono-tabular mt-0.5 break-all text-xs font-medium text-[#30282A]">
          {activeExperimentId ?? 'None loaded'}
        </p>
      </div>

      {/* Navigation Links */}
      <nav aria-label="Primary pages" className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center justify-between rounded-lg border-l-[3px] px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-l-[#702B3A] bg-[#FFFCF8] font-semibold text-[#702B3A]'
                    : 'border-l-transparent text-[#51494A] hover:bg-[#E8E0D6] hover:text-[#30282A]',
                )
              }
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </span>
              {item.phaseTag && (
                <span className="rounded border border-[#E5DCD3] bg-[#F7F3ED] px-1.5 py-0.5 text-[10px] font-medium text-[#827875]">
                  {item.phaseTag}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-6 border-t border-[#E5DCD3] pt-3 text-[11px] leading-relaxed text-[#827875]">
        <p className="font-semibold text-[#30282A]">MiniCert Research Workspace</p>
        <p>Interval Bound Propagation · Planet Triangle LP · Layer-4 Refinement</p>
      </div>
    </aside>
  );
}

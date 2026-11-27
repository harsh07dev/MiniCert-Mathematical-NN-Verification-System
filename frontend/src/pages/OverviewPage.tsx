import { useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ApiError } from '@/api/client';
import { minicertApi } from '@/api/endpoints';
import type {
  EpsilonMetricsDTO,
  EquivalenceMetricsBlockDTO,
  ExperimentResultsResponse,
  SequenceLayerDTO,
} from '@/api/types';
import { ChartContainer } from '@/components/common/ChartContainer';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ExportMenu } from '@/components/common/ExportMenu';
import { LoadingState } from '@/components/common/LoadingState';
import { MetricCard } from '@/components/common/MetricCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SectionHeader } from '@/components/common/SectionHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
  formatImprovementPp,
  formatOptionalNumber,
  formatPercentFromFraction,
  formatSeconds,
  formatTimestamp,
} from '@/lib/formatters';

const PIPELINE_STEPS = [
  {
    kicker: '01 · INPUT REGION',
    title: 'Bounded L-Infinity Ball',
    desc: 'Construct [x₀ − ε, x₀ + ε] clipped to valid normalized MNIST pixel bounds [0, 1]⁷⁸⁴.',
  },
  {
    kicker: '02 · ABSTRACTION',
    title: 'Float64 Mathematical Network',
    desc: 'Extract PyTorch Linear and ReLU layers into an ordered IEEE float64 operator sequence.',
  },
  {
    kicker: '03 · BASELINE IBP',
    title: 'Interval Bound Propagation',
    desc: 'Propagate Box enclosures layer by layer via W⁺l + W⁻u + b and elementwise ReLU in O(weights) time.',
  },
  {
    kicker: '04 · CONVEX RELAXATION',
    title: 'Planet Triangle LP',
    desc: 'Encode stable ReLUs exactly and relax unstable ReLUs (l < 0 < u) using the convex triangle hull.',
  },
  {
    kicker: '05 · L4 REFINEMENT',
    title: 'HiGHS Output Tightening',
    desc: 'Solve validated min/max LPs on the final output logits (L4-only default) with primal/dual checks.',
  },
  {
    kicker: '06 · VERDICT',
    title: 'Formal Certificate Check',
    desc: 'Certify strict target-logit dominance L_t > max(U_j) or return INCONCLUSIVE when bounds overlap.',
  },
];

export function OverviewPage() {
  const {
    overview,
    architecture,
    loading: workspaceLoading,
    error: workspaceError,
    refreshWorkspace,
  } = useWorkspace();

  const [evalResults, setEvalResults] = useState<ExperimentResultsResponse | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [totalExperiments, setTotalExperiments] = useState<number | null>(null);
  const [reloadEvalTick, setReloadEvalTick] = useState<number>(0);
  const [completedEvalKey, setCompletedEvalKey] = useState<string | null>(null);

  const expectedEvalKey = overview
    ? `${overview.latest_completed_experiment?.experiment_id ?? 'none'}:${reloadEvalTick}`
    : null;
  const evalLoading = Boolean(expectedEvalKey && completedEvalKey !== expectedEvalKey);

  useEffect(() => {
    if (!overview || !expectedEvalKey) {
      return;
    }
    const controller = new AbortController();

    minicertApi
      .getHistory(controller.signal)
      .then(async (history) => {
        setTotalExperiments(history.total);
        const latestCompleted = history.experiments.find(
          (item) => item.status === 'Completed',
        );
        if (!latestCompleted) {
          setEvalResults(null);
          setEvalError(null);
          return;
        }
        const results = await minicertApi.getExperimentResults(
          latestCompleted.experiment_id,
          controller.signal,
        );
        setEvalResults(results);
        setEvalError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (err instanceof ApiError) {
          setEvalError(err.detail);
        } else if (err instanceof Error) {
          setEvalError(err.message);
        } else {
          setEvalError('Unable to load persisted evaluation results.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCompletedEvalKey(expectedEvalKey);
        }
      });

    return () => controller.abort();
  }, [overview, expectedEvalKey]);

  const architectureColumns = useMemo<ColumnDef<SequenceLayerDTO, unknown>[]>(
    () => [
      {
        accessorKey: 'position',
        header: 'Pos',
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
      {
        accessorKey: 'type',
        header: 'Operator',
        cell: (info) => (
          <span className="font-mono-tabular uppercase text-[#702B3A]">
            {String(info.getValue())}
          </span>
        ),
      },
      {
        id: 'dimensions',
        header: 'Dimensions / Activation',
        accessorFn: (row) =>
          row.type === 'linear'
            ? `${row.input_features} → ${row.output_features}`
            : `max(0, z) (${row.activation ?? 'relu'})`,
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
    ],
    [],
  );

  const evaluationColumns = useMemo<ColumnDef<EpsilonMetricsDTO, unknown>[]>(
    () => [
      {
        accessorKey: 'epsilon',
        header: 'ε Radius',
        cell: (info) => (
          <span className="font-mono-tabular font-semibold">
            {formatOptionalNumber(info.getValue() as number, 4)}
          </span>
        ),
      },
      {
        id: 'evaluated',
        header: 'Evaluated',
        accessorFn: (row) => row.certification.evaluated_samples,
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
      {
        id: 'baseline_rate',
        header: 'Baseline IBP',
        accessorFn: (row) => row.certification.baseline_rate,
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatPercentFromFraction(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        id: 'refined_rate',
        header: 'Refined IBP + LP',
        accessorFn: (row) => row.certification.refined_rate,
        cell: (info) => (
          <span className="font-mono-tabular font-semibold text-[#702B3A]">
            {formatPercentFromFraction(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        id: 'improvement_pp',
        header: 'Improvement',
        accessorFn: (row) => row.certification.improvement_pp,
        cell: (info) => (
          <span className="font-mono-tabular text-[#1E7A34]">
            {formatImprovementPp(info.getValue() as number | null)}
          </span>
        ),
      },
      {
        id: 'mean_widths',
        header: 'Mean Width (IBP → LP)',
        accessorFn: (row) =>
          `${formatOptionalNumber(row.bounds.mean_baseline_width)} → ${formatOptionalNumber(row.bounds.mean_refined_width)}`,
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
      {
        id: 'mean_time',
        header: 'Mean Refined Time',
        accessorFn: (row) => row.runtime.mean_total_refined_time,
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatSeconds(info.getValue() as number | null)}
          </span>
        ),
      },
    ],
    [],
  );

  const equivalenceColumns = useMemo<ColumnDef<EquivalenceMetricsBlockDTO, unknown>[]>(
    () => [
      {
        accessorKey: 'epsilon',
        header: 'ε Radius',
        cell: (info) => (
          <span className="font-mono-tabular font-semibold">
            {formatOptionalNumber(info.getValue() as number | null, 4)}
          </span>
        ),
      },
      {
        accessorKey: 'completed_pairs',
        header: 'Pairs',
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
      {
        accessorKey: 'verdict_mismatches',
        header: 'Verdict Mismatches',
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
      {
        accessorKey: 'mode_a_total_lp_solves',
        header: 'Mode A Solves (All)',
        cell: (info) => (
          <span className="font-mono-tabular">
            {Number(info.getValue()).toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: 'mode_b_total_lp_solves',
        header: 'Mode B Solves (L4)',
        cell: (info) => (
          <span className="font-mono-tabular font-semibold text-[#702B3A]">
            {Number(info.getValue()).toLocaleString()}
          </span>
        ),
      },
      {
        accessorKey: 'mode_a_mean_runtime',
        header: 'Mode A Mean (s)',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatSeconds(info.getValue() as number, 2)}
          </span>
        ),
      },
      {
        accessorKey: 'mode_b_mean_runtime',
        header: 'Mode B Mean (s)',
        cell: (info) => (
          <span className="font-mono-tabular">
            {formatSeconds(info.getValue() as number, 2)}
          </span>
        ),
      },
      {
        accessorKey: 'mean_runtime_speedup',
        header: 'Mean Speedup',
        cell: (info) => (
          <span className="font-mono-tabular font-semibold text-[#1E7A34]">
            {Number(info.getValue()).toFixed(2)}×
          </span>
        ),
      },
    ],
    [],
  );

  const certChartData = useMemo(
    () =>
      (evalResults?.charts.certification_rates ?? []).map((pt) => ({
        epsilonLabel: String(pt.epsilon),
        epsilon: pt.epsilon,
        baseline_percent: pt.baseline_percent,
        refined_percent: pt.refined_percent,
      })),
    [evalResults],
  );

  const equivalenceSummary = overview?.equivalence_audit.summary ?? null;
  const equivalenceChartData = useMemo(
    () =>
      (equivalenceSummary?.by_epsilon ?? []).map((entry) => ({
        epsilonLabel: String(entry.epsilon ?? ''),
        epsilon: entry.epsilon,
        mode_a_mean_runtime: Number(entry.mode_a_mean_runtime.toFixed(3)),
        mode_b_mean_runtime: Number(entry.mode_b_mean_runtime.toFixed(3)),
        speedup: Number(entry.mean_runtime_speedup.toFixed(2)),
      })),
    [equivalenceSummary],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <PageHeader
        kicker="Neural Network Robustness Research"
        title="MiniCert Overview"
        description="Formal local robustness verification combining Interval Bound Propagation (IBP) with Planet/triangle LP-based bound refinement over L-infinity input regions."
        breadcrumbs={[{ label: 'Workspace' }, { label: 'Overview' }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refreshWorkspace();
              setReloadEvalTick((t) => t + 1);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh Metadata
          </Button>
        }
      />

      {workspaceLoading && !overview ? (
        <LoadingState
          label="Connecting to MiniCert FastAPI backend…"
          description="Loading model architecture, MNIST dataset metadata, and stored experiment artifacts."
        />
      ) : workspaceError ? (
        <ErrorState
          title="Backend connection error"
          message={workspaceError}
          onRetry={refreshWorkspace}
        />
      ) : null}

      {/* 1. Research Problem & Approach */}
      <section className="mb-8 grid gap-5 lg:grid-cols-2">
        <Card className="border-l-4 border-l-[#702B3A]">
          <CardHeader>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#702B3A]">
              Research Problem
            </p>
            <CardTitle className="font-serif-display text-xl font-normal">
              Why Interval Bound Propagation Over-Approximates
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-[#51494A]">
            <p>
              Standard test accuracy measures performance only on isolated points and offers
              no guarantee against bounded adversarial perturbations{' '}
              <code className="rounded bg-[#F1EAE2] px-1.5 py-0.5 text-xs text-[#30282A]">
                ||x − x₀||∞ ≤ ε
              </code>
              .
            </p>
            <p>
              <strong>Interval Bound Propagation (IBP)</strong> computes sound layer-by-layer
              hyper-rectangular enclosures in{' '}
              <code className="rounded bg-[#F1EAE2] px-1.5 py-0.5 text-xs text-[#30282A]">
                O(weights)
              </code>{' '}
              time, but ignores linear correlations between neurons across layers. This
              <em> wrapping effect</em> compounds across depth, yielding overly loose logit
              intervals that fail to certify genuinely robust inputs.
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#963E50]">
          <CardHeader>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#963E50]">
              Research Approach
            </p>
            <CardTitle className="font-serif-display text-xl font-normal">
              IBP + Planet/Triangle LP Refinement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-[#51494A]">
            <p>
              MiniCert uses a two-stage verification pipeline: fast IBP establishes valid
              intermediate pre- and post-activation envelopes, and then an objective-independent
              sparse Linear Program encodes affine layers exactly while relaxing unstable ReLUs (
              <code className="rounded bg-[#F1EAE2] px-1.5 py-0.5 text-xs text-[#30282A]">
                l &lt; 0 &lt; u
              </code>
              ) via the convex Planet triangle hull.
            </p>
            <p>
              Solving min/max LPs with SciPy HiGHS on the final output logits (Layer-4 default)
              tightens output enclosures without changing the formal safety criterion.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* 2. Verification Pipeline & Formal Condition */}
      <section className="mb-8">
        <SectionHeader
          kicker="Methodology"
          title="Two-Stage Verification Pipeline & Certification Condition"
          description="Six deterministic stages executed on identical L-infinity regions in IEEE float64 precision."
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE_STEPS.map((step) => (
            <div
              key={step.kicker}
              className="rounded-xl border border-[#E5DCD3] bg-[#FFFCF8] p-4"
            >
              <p className="font-mono-tabular text-[11px] font-bold tracking-[0.08em] text-[#702B3A]">
                {step.kicker}
              </p>
              <h3 className="mt-1 text-sm font-semibold text-[#30282A]">{step.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#51494A]">{step.desc}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#702B3A]">
                  Formal Certification Condition
                </p>
                <p className="font-mono-tabular mt-1.5 text-lg font-semibold text-[#30282A]">
                  L<sub>t</sub> &gt; max<sub>j ≠ t</sub> U<sub>j</sub> &nbsp;&nbsp;(Margin M = L
                  <sub>t</sub> − max<sub>j ≠ t</sub> U<sub>j</sub> &gt; 0)
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-[#51494A]">
                  Where <strong>L<sub>t</sub></strong> is the certified lower bound of the target
                  class logit <em>t</em> and <strong>U<sub>j</sub></strong> is the certified upper
                  bound of every competing class <em>j ≠ t</em>.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status="CERTIFIED" />
                <StatusBadge status="INCONCLUSIVE" />
              </div>
            </div>
            <div className="mt-4 rounded-r-lg border-l-4 border-l-[#702B3A] bg-[#F1EAE2] px-4 py-3 text-xs leading-relaxed text-[#30282A]">
              <strong>Scientific Distinction:</strong> An <strong>INCONCLUSIVE</strong> verdict
              only indicates that the sufficient dominance condition could not be proven from the
              computed bounds. It is <em>not</em> an adversarial example and does <em>not</em>{' '}
              prove that the network is unsafe.
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 3. Dynamic Model Architecture */}
      <section className="mb-8">
        <SectionHeader
          kicker="Dynamic Backend Inspection"
          title="Verified Network & Dataset Metadata"
          description="Retrieved directly from the cached checkpoint and dataset on the FastAPI backend."
        />
        {architecture && overview ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Source Model"
                value={architecture.source_model}
                sublabel={`${architecture.num_linear_layers} linear · ${architecture.num_sequence_layers} sequence ops`}
              />
              <MetricCard
                label="Input → Output"
                value={`${architecture.input_features} → ${architecture.output_features}`}
                sublabel={`${architecture.total_trainable_parameters.toLocaleString()} trainable parameters`}
              />
              <MetricCard
                label="Dataset Split"
                value={overview.dataset.total_samples.toLocaleString()}
                sublabel={`${overview.dataset.name} (${overview.dataset.split})`}
              />
              <MetricCard
                label="Stored Experiments"
                value={totalExperiments ?? overview.experiments_count}
                sublabel={
                  overview.latest_completed_experiment
                    ? `Latest: ${overview.latest_completed_experiment.experiment_id}`
                    : 'No completed experiments'
                }
              />
            </div>

            <DataTable
              data={architecture.sequence}
              columns={architectureColumns}
              caption="Extracted mathematical network sequence"
              compact
            />
            <p className="font-mono-tabular text-xs text-[#827875]">
              Checkpoint: {architecture.checkpoint}
            </p>
          </div>
        ) : !workspaceLoading && !workspaceError ? (
          <EmptyState
            title="Architecture metadata unavailable"
            description="No model metadata was returned by the backend."
          />
        ) : null}
      </section>

      {/* 4. Research Results A: Baseline IBP vs LP-Refined Certification */}
      <section className="mb-8">
        <SectionHeader
          kicker="Experiment Stream 1 · Certification Effectiveness"
          title="Baseline IBP vs. LP-Refined Certification Results"
          description="Empirical comparison on identical correctly classified MNIST test samples and perturbation radii. Kept strictly separate from the L4-only equivalence validation study below."
          actions={
            evalResults ? (
              <ExportMenu
                label="Download Artifacts"
                options={[
                  {
                    id: 'eval-csv',
                    label: 'Per-Sample CSV',
                    kind: 'csv',
                    href: minicertApi.getExportCsvUrl(evalResults.metadata.experiment_id),
                    downloadName: `${evalResults.metadata.experiment_id}_samples.csv`,
                  },
                  {
                    id: 'eval-json',
                    label: 'Summary JSON',
                    kind: 'json',
                    href: minicertApi.getExportJsonUrl(evalResults.metadata.experiment_id),
                    downloadName: `${evalResults.metadata.experiment_id}_summary.json`,
                  },
                ]}
              />
            ) : undefined
          }
        />

        {evalLoading ? (
          <LoadingState label="Loading persisted Baseline vs. LP-Refined evaluation…" />
        ) : evalError ? (
          <ErrorState
            title="Could not load evaluation experiment"
            message={evalError}
            onRetry={() => setReloadEvalTick((t) => t + 1)}
          />
        ) : evalResults ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5DCD3] bg-[#FFFCF8] px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={evalResults.metadata.status} />
                <span className="font-mono-tabular font-semibold text-[#30282A]">
                  {evalResults.metadata.experiment_id}
                </span>
                <span className="text-[#827875]">
                  ({evalResults.metadata.experiment_type})
                </span>
              </div>
              <div className="font-mono-tabular text-[#51494A]">
                Samples: {evalResults.sample_selection.selected ?? evalResults.metadata.sample_count}{' '}
                (excluded {evalResults.sample_selection.incorrect_excluded ?? 0} misclassified) ·
                Seed: {evalResults.metadata.seed} ·{' '}
                {formatTimestamp(evalResults.metadata.timestamp)}
              </div>
            </div>

            <DataTable
              data={evalResults.metrics}
              columns={evaluationColumns}
              caption="Baseline IBP versus LP-Refined certification summary by epsilon"
            />

            <ChartContainer
              id="overview-baseline-vs-refined-cert"
              title="Certification Rate: Baseline IBP vs. LP-Refined"
              description="Percentage of evaluated correctly classified samples certified robust across perturbation radii."
              unit="%"
              data={certChartData}
              columns={[
                { key: 'epsilon', label: 'Epsilon (ε)' },
                {
                  key: 'baseline_percent',
                  label: 'Baseline IBP (%)',
                  format: (v) =>
                    typeof v === 'number' ? `${v.toFixed(1)}%` : '—',
                },
                {
                  key: 'refined_percent',
                  label: 'Refined IBP + LP (%)',
                  format: (v) =>
                    typeof v === 'number' ? `${v.toFixed(1)}%` : '—',
                },
              ]}
            >
              {({ showLegend, showGrid }) => (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={certChartData}
                    margin={{ top: 12, right: 20, left: 4, bottom: 8 }}
                  >
                    {showGrid && (
                      <CartesianGrid stroke="#E5DCD3" strokeDasharray="3 3" />
                    )}
                    <XAxis
                      dataKey="epsilonLabel"
                      tick={{ fill: '#30282A', fontSize: 12 }}
                      stroke="#C9BEB5"
                      label={{
                        value: 'Perturbation Radius (ε)',
                        position: 'insideBottom',
                        offset: -4,
                        fill: '#51494A',
                        fontSize: 12,
                      }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: '#30282A', fontSize: 12 }}
                      stroke="#C9BEB5"
                      label={{
                        value: 'Certified (%)',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#51494A',
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFCF8',
                        borderColor: '#E5DCD3',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(val: unknown) =>
                        typeof val === 'number' ? `${val.toFixed(1)}%` : 'n/a'
                      }
                      labelFormatter={(label) => `ε = ${label}`}
                    />
                    {showLegend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                    <Line
                      type="monotone"
                      dataKey="baseline_percent"
                      name="Baseline IBP (%)"
                      stroke="#786B67"
                      strokeWidth={2.2}
                      dot={{ r: 4, fill: '#786B67' }}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="refined_percent"
                      name="Refined IBP + LP (%)"
                      stroke="#702B3A"
                      strokeWidth={2.5}
                      dot={{ r: 4.5, fill: '#702B3A' }}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartContainer>
          </div>
        ) : (
          <EmptyState
            title="No Completed Evaluation Experiments Found"
            description="Run a baseline vs. LP-refined experiment to populate certification rate comparisons."
          />
        )}
      </section>

      {/* 5. Research Results B: Separate L4-Only vs All-Target Equivalence Validation */}
      <section className="mb-8">
        <SectionHeader
          kicker="Experiment Stream 2 · Separate Optimization Equivalence Audit"
          title="All-Target vs. L4-Only Refinement Equivalence Validation"
          description="Independent paired validation comparing Mode A (hidden unstable ReLUs + output logits) against Mode B (production L4-only output logits) on the trained MiniCertNet checkpoint."
        />

        {overview?.equivalence_audit.available && equivalenceSummary ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Evaluated Samples"
                value={equivalenceSummary.sample_selection.selected}
                sublabel={`Seed ${equivalenceSummary.config.seed} · tolerance ${equivalenceSummary.config.tolerance.toExponential(0)}`}
              />
              <MetricCard
                label="Paired Queries"
                value={equivalenceSummary.overall.completed_pairs}
                sublabel={`${equivalenceSummary.config.epsilons.length} perturbation radii`}
              />
              <MetricCard
                label="Verdict Discrepancies"
                value={`${equivalenceSummary.overall.verdict_mismatches} / ${equivalenceSummary.overall.total_pairs}`}
                sublabel={`Max bound diff: ${equivalenceSummary.overall.max_lower_diff.toExponential(2)}`}
                tone="positive"
              />
              <MetricCard
                label="Mean Speedup (L4-Only)"
                value={`${equivalenceSummary.overall.mean_runtime_speedup.toFixed(2)}×`}
                sublabel={
                  overview.equivalence_audit.solves_ratio
                    ? `${equivalenceSummary.overall.mode_a_total_lp_solves.toLocaleString()} → ${equivalenceSummary.overall.mode_b_total_lp_solves.toLocaleString()} LP solves (${overview.equivalence_audit.solves_ratio.toFixed(2)}× fewer)`
                    : undefined
                }
                tone="positive"
              />
            </div>

            <DataTable
              data={equivalenceSummary.by_epsilon}
              columns={equivalenceColumns}
              caption="Per-epsilon equivalence validation metrics (Mode A all-target vs Mode B L4-only)"
            />

            <ChartContainer
              id="overview-equivalence-runtime"
              title="Mean Runtime: All-Target (Mode A) vs. L4-Only (Mode B)"
              description="Comparison of mean verification runtime per sample in the equivalence audit (distinct from Baseline IBP vs. LP certification)."
              unit="s"
              data={equivalenceChartData}
              columns={[
                { key: 'epsilon', label: 'Epsilon (ε)' },
                { key: 'mode_a_mean_runtime', label: 'Mode A All-Target (s)' },
                { key: 'mode_b_mean_runtime', label: 'Mode B L4-Only (s)' },
                { key: 'speedup', label: 'Speedup (×)' },
              ]}
            >
              {({ showLegend, showGrid }) => (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={equivalenceChartData}
                    margin={{ top: 12, right: 20, left: 4, bottom: 8 }}
                  >
                    {showGrid && (
                      <CartesianGrid stroke="#E5DCD3" strokeDasharray="3 3" />
                    )}
                    <XAxis
                      dataKey="epsilonLabel"
                      tick={{ fill: '#30282A', fontSize: 12 }}
                      stroke="#C9BEB5"
                      label={{
                        value: 'Perturbation Radius (ε)',
                        position: 'insideBottom',
                        offset: -4,
                        fill: '#51494A',
                        fontSize: 12,
                      }}
                    />
                    <YAxis
                      tick={{ fill: '#30282A', fontSize: 12 }}
                      stroke="#C9BEB5"
                      label={{
                        value: 'Mean Runtime (s)',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#51494A',
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFCF8',
                        borderColor: '#E5DCD3',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(val: unknown) =>
                        typeof val === 'number' ? `${val.toFixed(3)}s` : 'n/a'
                      }
                      labelFormatter={(label) => `ε = ${label}`}
                    />
                    {showLegend && <Legend wrapperStyle={{ fontSize: '12px' }} />}
                    <Bar
                      dataKey="mode_a_mean_runtime"
                      name="Mode A: All-Target (s)"
                      fill="#786B67"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="mode_b_mean_runtime"
                      name="Mode B: L4-Only Default (s)"
                      fill="#627D68"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartContainer>

            <p className="text-xs leading-relaxed text-[#827875]">
              Scope caveat: Equivalence results are empirically validated for this single{' '}
              <code>MiniCertNet</code> checkpoint across 100 seed-39 MNIST samples and do not
              constitute a universal theorem for arbitrary architectures or multi-step Branch-and-Bound
              splitting.
            </p>
          </div>
        ) : (
          <EmptyState
            title="Equivalence Audit Summary Not Available"
            description={
              overview?.equivalence_audit.error ??
              'The equivalence validation artifact (equivalence_seed39_n100_summary.json) is not present.'
            }
          />
        )}
      </section>

      {/* 6. Scope & Limitations */}
      <section>
        <SectionHeader
          kicker="Soundness & Scope"
          title="Supported Capabilities & Research Boundaries"
        />
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="border-t-4 border-t-[#702B3A]">
            <CardHeader>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#702B3A]">
                Currently Supported
              </p>
              <CardTitle className="text-base">Verified Scope</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-4 text-sm text-[#51494A]">
                <li>
                  <strong>Architecture:</strong> Sequential fully-connected MLPs with{' '}
                  <code>Linear</code> and <code>ReLU</code> layers.
                </li>
                <li>
                  <strong>Dataset & Domain:</strong> MNIST 28×28 normalized feature vectors in{' '}
                  <code>[0, 1]⁷⁸⁴</code>.
                </li>
                <li>
                  <strong>Perturbation Model:</strong> Bounded L-infinity ball{' '}
                  <code>||x − x₀||∞ ≤ ε</code> clipped to valid pixel bounds.
                </li>
                <li>
                  <strong>Numerical Engine:</strong> IEEE 754 float64 arithmetic with SciPy HiGHS
                  dual-simplex validation (<code>10⁻⁸</code> relative / <code>10⁻¹²</code>{' '}
                  containment tolerances).
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-[#963E50]">
            <CardHeader>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#963E50]">
                Out-of-Scope Boundaries
              </p>
              <CardTitle className="text-base">Known Limitations</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-4 text-sm text-[#51494A]">
                <li>
                  <strong>Unsupported Layers:</strong> Convolutional, pooling, normalization, and
                  attention layers are rejected by the extractor.
                </li>
                <li>
                  <strong>Unsupported Activations:</strong> Sigmoid, Tanh, GELU, and SiLU are not
                  supported.
                </li>
                <li>
                  <strong>Floating-Point Arithmetic:</strong> Soundness relies on float64 solver
                  tolerances, not exact rational or directed-rounding certificates.
                </li>
                <li>
                  <strong>Incomplete Relaxation:</strong> Convex LP relaxation cannot prove all
                  robust inputs; <code>INCONCLUSIVE</code> never yields an adversarial example.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </motion.div>
  );
}

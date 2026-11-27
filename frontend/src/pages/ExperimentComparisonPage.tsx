import { useEffect, useMemo, useRef, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckSquare, GitCompare, Info, Square } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ApiError } from '@/api/client';
import { minicertApi } from '@/api/endpoints';
import type {
  ComparisonPerEpsilonMetrics,
  ComparisonResponse,
  ExperimentMetadataDTO,
} from '@/api/types';
import { ChartContainer, type ChartDataColumn } from '@/components/common/ChartContainer';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { PageHeader } from '@/components/common/PageHeader';
import { SectionHeader } from '@/components/common/SectionHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatOptionalNumber, formatTimestamp } from '@/lib/formatters';

const EXP_PALETTE = [
  '#702B3A',
  '#627D68',
  '#A7793D',
  '#596F83',
  '#963E50',
  '#6C626A',
  '#8C765C',
  '#455D50',
];

function formatComparisonChartData(
  comparison: ComparisonResponse,
  metricKey: keyof ComparisonPerEpsilonMetrics,
): Array<Record<string, unknown>> {
  const { matching_epsilons, experiments } = comparison.chart_series;
  return matching_epsilons.map((eps) => {
    const epsKey = `${Number(eps)}`;
    const row: Record<string, unknown> = {
      epsilon: eps,
      epsilonLabel: String(eps),
    };
    experiments.forEach((exp, idx) => {
      const perEps =
        exp.per_epsilon[epsKey] ??
        exp.per_epsilon[String(eps)] ??
        null;
      row[`exp_${idx}`] = perEps ? perEps[metricKey] : null;
    });
    return row;
  });
}

export function ExperimentComparisonPage() {
  const [completedRuns, setCompletedRuns] = useState<ExperimentMetadataDTO[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [rawComparison, setRawComparison] = useState<ComparisonResponse | null>(null);
  const [rawCompareError, setRawCompareError] = useState<string | null>(null);
  const [loadedComparisonKey, setLoadedComparisonKey] = useState<string | null>(null);
  const compareAbortRef = useRef<AbortController | null>(null);

  const comparisonKey = selectedIds.length >= 2 ? selectedIds.join('|') : null;
  const comparing = Boolean(comparisonKey && loadedComparisonKey !== comparisonKey);
  const comparison = comparisonKey ? rawComparison : null;
  const compareError = comparisonKey ? rawCompareError : null;

  // Load completed experiments from persistent history
  useEffect(() => {
    const controller = new AbortController();

    minicertApi
      .getHistory(controller.signal)
      .then((res) => {
        const completed = res.experiments.filter((e) => e.status === 'Completed');
        setCompletedRuns(completed);
        setHistoryError(null);
        setSelectedIds((prev) => {
          const validPrev = prev.filter((id) =>
            completed.some((c) => c.experiment_id === id),
          );
          if (validPrev.length >= 2) {
            return validPrev;
          }
          return completed.slice(0, 2).map((c) => c.experiment_id);
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setHistoryError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : 'Failed to load completed experiments.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setHistoryLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  // Automatically compute comparison whenever >=2 valid IDs are selected
  useEffect(() => {
    if (!comparisonKey) {
      compareAbortRef.current?.abort();
      return;
    }

    compareAbortRef.current?.abort();
    const controller = new AbortController();
    compareAbortRef.current = controller;

    minicertApi
      .compareExperiments({ experiment_ids: selectedIds }, controller.signal)
      .then((res) => {
        setRawComparison(res);
        setRawCompareError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setRawComparison(null);
        setRawCompareError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : 'Failed to compare selected experiments.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadedComparisonKey(comparisonKey);
        }
      });

    return () => controller.abort();
  }, [comparisonKey, selectedIds]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectedMetadata = useMemo(
    () => completedRuns.filter((run) => selectedIds.includes(run.experiment_id)),
    [completedRuns, selectedIds],
  );

  // Build dynamic TanStack columns for the 10-metric comparison table
  const comparisonTableColumns = useMemo<
    ColumnDef<Record<string, string | number | null>, unknown>[]
  >(() => {
    if (!comparison) {
      return [];
    }
    const cols: ColumnDef<Record<string, string | number | null>, unknown>[] = [
      {
        accessorKey: 'Metric',
        header: 'Metric',
        cell: (info) => (
          <span className="font-medium text-[#30282A]">{String(info.getValue())}</span>
        ),
      },
    ];
    for (const item of comparison.experiments) {
      const label = item.display_label;
      cols.push({
        id: item.metadata.experiment_id,
        header: label,
        accessorFn: (row) => row[label] ?? '—',
        cell: (info) => (
          <span className="font-mono-tabular text-xs">{String(info.getValue())}</span>
        ),
      });
    }
    return cols;
  }, [comparison]);

  const chartColumns = useMemo<ChartDataColumn[]>(() => {
    if (!comparison) {
      return [];
    }
    return [
      { key: 'epsilon', label: 'Epsilon (ε)' },
      ...comparison.chart_series.experiments.map((exp, idx) => ({
        key: `exp_${idx}`,
        label: exp.label,
        format: (v: unknown) => formatOptionalNumber(v as number | null, 4),
      })),
    ];
  }, [comparison]);

  const certChartData = useMemo(
    () => (comparison ? formatComparisonChartData(comparison, 'refined_rate_pct') : []),
    [comparison],
  );
  const improvementChartData = useMemo(
    () => (comparison ? formatComparisonChartData(comparison, 'improvement_pp') : []),
    [comparison],
  );
  const widthChartData = useMemo(
    () => (comparison ? formatComparisonChartData(comparison, 'refined_width') : []),
    [comparison],
  );
  const runtimeChartData = useMemo(
    () => (comparison ? formatComparisonChartData(comparison, 'refined_total_time') : []),
    [comparison],
  );

  return (
    <div>
      <PageHeader
        kicker="Cross-Experiment Analysis"
        title="Experiment Comparison"
        description="Compare two or more completed baseline-vs-refined evaluations across matching perturbation radii with strict sample-set comparability validation."
        breadcrumbs={[{ label: 'Workspace', to: '/' }, { label: 'Experiment Comparison' }]}
      />

      {historyLoading ? (
        <LoadingState label="Loading completed experiments for comparison…" />
      ) : historyError ? (
        <ErrorState title="Could not load experiment list" message={historyError} />
      ) : completedRuns.length < 2 ? (
        <EmptyState
          icon={<GitCompare className="h-5 w-5" aria-hidden="true" />}
          title="At Least Two Completed Experiments Required"
          description="Execute additional evaluation runs in New Experiment to enable side-by-side comparison."
        />
      ) : (
        <div className="space-y-8">
          {/* 1. Multi-select picker + selected config summary */}
          <section>
            <SectionHeader
              kicker="Step 1 · Select Experiments"
              title="Choose Completed Runs to Compare (Minimum 2)"
              description="Only baseline-vs-refined evaluation runs are compared here; the L4-only equivalence validation study remains strictly separate on Overview."
            />

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {completedRuns.map((run) => {
                const checked = selectedIds.includes(run.experiment_id);
                return (
                  <button
                    key={run.experiment_id}
                    type="button"
                    onClick={() => toggleSelection(run.experiment_id)}
                    aria-pressed={checked}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                      checked
                        ? 'border-[#702B3A] bg-[#FFFCF8]'
                        : 'border-[#E5DCD3] bg-[#FFFCF8]/70 hover:border-[#827875]'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#702B3A]"
                        aria-hidden="true"
                      />
                    ) : (
                      <Square
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#827875]"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="font-mono-tabular truncate text-xs font-semibold text-[#30282A]">
                          {run.experiment_id}
                        </span>
                        <StatusBadge status={run.status} />
                      </div>
                      <p className="font-mono-tabular text-[11px] text-[#51494A]">
                        type: {run.experiment_type} · n={run.sample_count} · seed={run.seed}
                      </p>
                      <p className="font-mono-tabular text-[11px] text-[#827875]">
                        ε: [{run.epsilons.join(', ')}] · {formatTimestamp(run.timestamp)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedMetadata.length > 0 && (
              <Card className="mt-4">
                <CardContent className="pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-[#827875]">
                    Selected Configurations ({selectedMetadata.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedMetadata.map((meta, idx) => (
                      <span
                        key={meta.experiment_id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-2.5 py-1 font-mono-tabular text-xs text-[#30282A]"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: EXP_PALETTE[idx % EXP_PALETTE.length] }}
                        />
                        {meta.experiment_id} (n={meta.sample_count}, seed={meta.seed})
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

          {selectedIds.length < 2 ? (
            <EmptyState
              title="Select at Least Two Experiments"
              description="Choose two or more completed experiments above to compute comparability checks, 10-metric tables, and grouped charts."
            />
          ) : comparing ? (
            <LoadingState label="Computing comparability analysis and matching metrics…" />
          ) : compareError ? (
            <ErrorState title="Comparison failed" message={compareError} />
          ) : comparison ? (
            <>
              {/* 2. Comparability Notices */}
              <section>
                <SectionHeader
                  kicker="Step 2 · Comparability Audit"
                  title="Comparability Analysis & Validation Notices"
                />
                <div className="space-y-2.5">
                  {comparison.notices.map((notice, idx) => {
                    const isWarning =
                      notice.toLowerCase().includes('differ') ||
                      notice.toLowerCase().includes('not evaluate identical');
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-xs leading-relaxed text-[#30282A] ${
                          isWarning
                            ? 'border-[#9A6700]/40 bg-[#9A6700]/8'
                            : 'border-[#E5DCD3] bg-[#F1EAE2]'
                        }`}
                      >
                        {isWarning ? (
                          <AlertTriangle
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#9A6700]"
                            aria-hidden="true"
                          />
                        ) : (
                          <Info
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#702B3A]"
                            aria-hidden="true"
                          />
                        )}
                        <span>{notice}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {comparison.matching_epsilons.length === 0 ? (
                <ErrorState
                  title="No Common Perturbation Radii (ε)"
                  message="No matching epsilon values were found across the selected experiments. At least one shared ε is required for side-by-side comparison."
                />
              ) : (
                <>
                  {/* 3. 10-Metric Side-by-Side Comparison Table */}
                  <section>
                    <SectionHeader
                      kicker="Step 3 · Matching Epsilon Metrics"
                      title="10-Metric Side-by-Side Comparison Table"
                      description={`Comparing matching perturbation radii: [${comparison.matching_epsilons.join(
                        ', ',
                      )}]. Missing observations remain "—" and are never converted to zero.`}
                    />

                    {comparison.tables.length === 1 ? (
                      <div className="space-y-2">
                        <p className="font-mono-tabular text-xs font-semibold text-[#51494A]">
                          Perturbation Radius ε = {comparison.tables[0].epsilon}
                        </p>
                        <DataTable
                          data={comparison.tables[0].rows}
                          columns={comparisonTableColumns}
                          caption={`10-metric comparison at epsilon ${comparison.tables[0].epsilon}`}
                        />
                      </div>
                    ) : (
                      <Tabs
                        defaultValue={String(comparison.tables[0].epsilon)}
                        className="w-full"
                      >
                        <TabsList aria-label="Matching perturbation radii">
                          {comparison.tables.map((t) => (
                            <TabsTrigger key={t.epsilon} value={String(t.epsilon)}>
                              ε = {t.epsilon}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        {comparison.tables.map((t) => (
                          <TabsContent key={t.epsilon} value={String(t.epsilon)}>
                            <DataTable
                              data={t.rows}
                              columns={comparisonTableColumns}
                              caption={`10-metric comparison at epsilon ${t.epsilon}`}
                            />
                          </TabsContent>
                        ))}
                      </Tabs>
                    )}
                  </section>

                  {/* 4. Four Grouped Comparison Charts */}
                  <section>
                    <SectionHeader
                      kicker="Step 4 · Comparative Charts"
                      title="Comparative Publication Charts"
                      description="Grouped visualizations across matching perturbation radii with accessible numerical tables and PNG/CSV export."
                    />

                    <div className="grid gap-6">
                      <ChartContainer
                        id="comparison-certification-rate"
                        title="1. Refined Certification Rate Comparison (IBP + LP)"
                        description="Refined certification percentage across comparable experiments at matching perturbation radii."
                        unit="%"
                        data={certChartData}
                        columns={chartColumns}
                      >
                        {({ showLegend, showGrid }) => (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
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
                                  value: 'Matching Epsilon (ε)',
                                  position: 'insideBottom',
                                  offset: -4,
                                  fill: '#51494A',
                                  fontSize: 12,
                                }}
                              />
                              <YAxis
                                domain={[0, 100]}
                                ticks={[0, 20, 40, 60, 80, 100]}
                                tick={{ fill: '#30282A', fontSize: 12 }}
                                stroke="#C9BEB5"
                                label={{
                                  value: 'Refined Rate (%)',
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
                                  typeof val === 'number' ? `${val.toFixed(2)}%` : 'n/a'
                                }
                                labelFormatter={(label) => `ε = ${label}`}
                              />
                              {showLegend && <Legend wrapperStyle={{ fontSize: '11px' }} />}
                              {comparison.chart_series.experiments.map((exp, idx) => (
                                <Bar
                                  key={exp.id}
                                  dataKey={`exp_${idx}`}
                                  name={exp.label}
                                  fill={EXP_PALETTE[idx % EXP_PALETTE.length]}
                                  radius={[4, 4, 0, 0]}
                                />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </ChartContainer>

                      <ChartContainer
                        id="comparison-improvement"
                        title="2. Certification Improvement Comparison (Refined − Baseline)"
                        description="Refined minus baseline certification rate in percentage points for each experiment."
                        unit="pp"
                        data={improvementChartData}
                        columns={chartColumns}
                      >
                        {({ showLegend, showGrid }) => (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={improvementChartData}
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
                                  value: 'Matching Epsilon (ε)',
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
                                  value: 'Improvement (pp)',
                                  angle: -90,
                                  position: 'insideLeft',
                                  fill: '#51494A',
                                  fontSize: 12,
                                }}
                              />
                              <ReferenceLine y={0} stroke="#30282A" strokeWidth={1} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#FFFCF8',
                                  borderColor: '#E5DCD3',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                }}
                                formatter={(val: unknown) =>
                                  typeof val === 'number'
                                    ? `${val > 0 ? '+' : ''}${val.toFixed(2)} pp`
                                    : 'n/a'
                                }
                                labelFormatter={(label) => `ε = ${label}`}
                              />
                              {showLegend && <Legend wrapperStyle={{ fontSize: '11px' }} />}
                              {comparison.chart_series.experiments.map((exp, idx) => (
                                <Bar
                                  key={exp.id}
                                  dataKey={`exp_${idx}`}
                                  name={exp.label}
                                  fill={EXP_PALETTE[idx % EXP_PALETTE.length]}
                                  radius={[4, 4, 0, 0]}
                                />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </ChartContainer>

                      <ChartContainer
                        id="comparison-widths"
                        title="3. Mean Refined Output Interval Width Comparison"
                        description="Mean refined output-logit interval width across compared runs (narrower intervals indicate tighter enclosures)."
                        unit="Logit units"
                        data={widthChartData}
                        columns={chartColumns}
                      >
                        {({ showLegend, showGrid }) => (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={widthChartData}
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
                                  value: 'Matching Epsilon (ε)',
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
                                  value: 'Mean width (logit units)',
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
                                  typeof val === 'number'
                                    ? formatOptionalNumber(val, 4)
                                    : 'n/a'
                                }
                                labelFormatter={(label) => `ε = ${label}`}
                              />
                              {showLegend && <Legend wrapperStyle={{ fontSize: '11px' }} />}
                              {comparison.chart_series.experiments.map((exp, idx) => (
                                <Bar
                                  key={exp.id}
                                  dataKey={`exp_${idx}`}
                                  name={exp.label}
                                  fill={EXP_PALETTE[idx % EXP_PALETTE.length]}
                                  radius={[4, 4, 0, 0]}
                                />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </ChartContainer>

                      <ChartContainer
                        id="comparison-runtime"
                        title="4. Total Refined Verification Runtime Comparison"
                        description="Mean total refined verification runtime per sample in seconds across compared runs."
                        unit="Seconds"
                        data={runtimeChartData}
                        columns={chartColumns}
                      >
                        {({ showLegend, showGrid }) => (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={runtimeChartData}
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
                                  value: 'Matching Epsilon (ε)',
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
                                  value: 'Mean runtime (s)',
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
                                  typeof val === 'number'
                                    ? `${formatOptionalNumber(val, 4)}s`
                                    : 'n/a'
                                }
                                labelFormatter={(label) => `ε = ${label}`}
                              />
                              {showLegend && <Legend wrapperStyle={{ fontSize: '11px' }} />}
                              {comparison.chart_series.experiments.map((exp, idx) => (
                                <Bar
                                  key={exp.id}
                                  dataKey={`exp_${idx}`}
                                  name={exp.label}
                                  fill={EXP_PALETTE[idx % EXP_PALETTE.length]}
                                  radius={[4, 4, 0, 0]}
                                />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </ChartContainer>
                    </div>
                  </section>
                </>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Download,
  FileJson,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { minicertApi } from '@/api/endpoints';
import type { ExperimentMetadataDTO, HistoryDetailResponse } from '@/api/types';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ExperimentChartsTabs } from '@/components/common/ExperimentChartsTabs';
import { LoadingState } from '@/components/common/LoadingState';
import { MetricCard } from '@/components/common/MetricCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SampleRecordsTable } from '@/components/common/SampleRecordsTable';
import { SectionHeader } from '@/components/common/SectionHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkspace } from '@/context/WorkspaceContext';
import {
  formatImprovementPp,
  formatPercentFromFraction,
  formatTimestamp,
} from '@/lib/formatters';

export function ExperimentHistoryPage() {
  const navigate = useNavigate();
  const { setActiveExperimentId, refreshWorkspace } = useWorkspace();

  const [experiments, setExperiments] = useState<ExperimentMetadataDTO[]>([]);
  const [listLoading, setListLoading] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rawDetail, setRawDetail] = useState<HistoryDetailResponse | null>(null);
  const [rawDetailError, setRawDetailError] = useState<string | null>(null);
  const [loadedDetailId, setLoadedDetailId] = useState<string | null>(null);

  const [showConfigJson, setShowConfigJson] = useState<boolean>(false);
  const [showSampleTable, setShowSampleTable] = useState<boolean>(false);
  const [reloadTick, setReloadTick] = useState<number>(0);

  const detailLoading = Boolean(selectedId && loadedDetailId !== selectedId);
  const detail = selectedId ? rawDetail : null;
  const detailError = selectedId ? rawDetailError : null;

  // Load experiment history list
  useEffect(() => {
    const controller = new AbortController();

    minicertApi
      .getHistory(controller.signal)
      .then((res) => {
        setExperiments(res.experiments);
        setListError(null);
        setSelectedId((prev) => {
          if (prev && res.experiments.some((e) => e.experiment_id === prev)) {
            return prev;
          }
          return res.experiments[0]?.experiment_id ?? null;
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setListError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : 'Failed to load experiment history.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setListLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadTick]);

  // Load details for selected experiment
  useEffect(() => {
    if (!selectedId) {
      return;
    }

    const controller = new AbortController();

    minicertApi
      .getHistoryDetail(selectedId, controller.signal)
      .then((data) => {
        setRawDetail(data);
        setRawDetailError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setRawDetail(null);
        setRawDetailError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : 'Failed to load stored experiment details.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadedDetailId(selectedId);
        }
      });

    return () => controller.abort();
  }, [selectedId]);

  const handleRefreshHistory = async () => {
    setRefreshing(true);
    setRefreshNotice(null);
    try {
      const res = await minicertApi.refreshHistory();
      setExperiments(res.experiments);
      setRefreshNotice(
        res.imported_count > 0
          ? `Discovered and imported ${res.imported_count} new experiment(s).`
          : 'Experiment repository is up to date (0 new legacy runs found).',
      );
      refreshWorkspace();
    } catch (err: unknown) {
      setListError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'History refresh failed.',
      );
    } finally {
      setRefreshing(false);
    }
  };

  const historyColumns = useMemo<ColumnDef<ExperimentMetadataDTO, unknown>[]>(
    () => [
      {
        accessorKey: 'experiment_id',
        header: 'Experiment ID',
        cell: (info) => (
          <span className="font-mono-tabular font-semibold text-[#30282A]">
            {String(info.getValue())}
          </span>
        ),
      },
      {
        accessorKey: 'experiment_type',
        header: 'Type',
        cell: (info) => (
          <span className="capitalize text-[#51494A]">{String(info.getValue())}</span>
        ),
      },
      {
        accessorKey: 'timestamp',
        header: 'Timestamp',
        cell: (info) => (
          <span className="font-mono-tabular text-xs text-[#51494A]">
            {formatTimestamp(info.getValue() as string)}
          </span>
        ),
      },
      {
        accessorKey: 'sample_count',
        header: 'Samples',
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
      {
        id: 'epsilons',
        header: 'Epsilon Values',
        accessorFn: (row) => (row.epsilons.length > 0 ? row.epsilons.join(', ') : '—'),
        cell: (info) => (
          <span className="font-mono-tabular text-xs">{String(info.getValue())}</span>
        ),
      },
      {
        accessorKey: 'seed',
        header: 'Seed',
        cell: (info) => <span className="font-mono-tabular">{String(info.getValue())}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (info) => <StatusBadge status={String(info.getValue())} />,
      },
    ],
    [],
  );

  const selectedMeta =
    experiments.find((e) => e.experiment_id === selectedId) ?? detail?.metadata ?? null;

  return (
    <div>
      <PageHeader
        kicker="Benchmark Repository"
        title="Experiment History"
        description="Browse, inspect, and export persisted verification experiments from disk without re-evaluating queries."
        breadcrumbs={[{ label: 'Workspace', to: '/' }, { label: 'Experiment History' }]}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void handleRefreshHistory()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{refreshing ? 'Refreshing…' : 'Refresh History'}</span>
          </Button>
        }
      />

      {refreshNotice && (
        <div className="mb-5 rounded-lg border border-[#1E7A34]/35 bg-[#1E7A34]/8 px-4 py-2.5 text-xs font-medium text-[#30282A]">
          {refreshNotice}
        </div>
      )}

      {listLoading ? (
        <LoadingState label="Scanning persisted experiment repository…" />
      ) : listError ? (
        <ErrorState
          title="Could not load experiment history"
          message={listError}
          onRetry={() => {
            setListLoading(true);
            setListError(null);
            setReloadTick((t) => t + 1);
          }}
        />
      ) : experiments.length === 0 ? (
        <EmptyState
          title="No Stored Experiments Found"
          description="Run a benchmark in New Experiment or place completed artifacts under results/ and click Refresh History."
        />
      ) : (
        <div className="space-y-8">
          {/* Repository Table */}
          <section>
            <SectionHeader
              kicker="Stored Runs"
              title={`Persisted Experiments (${experiments.length})`}
              description="Click any row or choose an experiment below to inspect its configuration, metrics, charts, and downloads."
            />
            <DataTable
              data={experiments}
              columns={historyColumns}
              caption="Experiment history repository table"
              onRowClick={(row) => setSelectedId(row.experiment_id)}
              isRowSelected={(row) => row.experiment_id === selectedId}
            />
          </section>

          {/* Selected Experiment Inspector */}
          <section>
            <SectionHeader
              kicker="Historical Inspector"
              title="Inspect Stored Experiment"
              actions={
                <select
                  aria-label="Choose experiment to inspect"
                  value={selectedId ?? ''}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="rounded-lg border border-[#E5DCD3] bg-[#FFFCF8] px-3 py-1.5 font-mono-tabular text-xs text-[#30282A]"
                >
                  {experiments.map((exp) => (
                    <option key={exp.experiment_id} value={exp.experiment_id}>
                      {exp.experiment_id} ({exp.experiment_type} · {exp.status})
                    </option>
                  ))}
                </select>
              }
            />

            {detailLoading ? (
              <LoadingState label={`Loading details for "${selectedId}"…`} />
            ) : detailError ? (
              <ErrorState title="Inspection failed" message={detailError} />
            ) : detail && selectedMeta ? (
              <div className="space-y-6">
                <Card>
                  <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-tabular text-base font-semibold text-[#30282A]">
                          {detail.metadata.experiment_id}
                        </span>
                        <StatusBadge status={detail.metadata.status} />
                        <span className="rounded border border-[#E5DCD3] bg-[#F1EAE2] px-2 py-0.5 text-[11px] capitalize text-[#51494A]">
                          {detail.metadata.experiment_type}
                        </span>
                      </div>
                      <p className="font-mono-tabular text-xs text-[#51494A]">
                        Samples: {detail.metadata.sample_count} · Epsilons: [
                        {detail.metadata.epsilons.join(', ')}] · Seed: {detail.metadata.seed} ·{' '}
                        {formatTimestamp(detail.metadata.timestamp)}
                      </p>
                    </div>

                    {detail.loadable && (
                      <div className="flex flex-wrap gap-2">
                        {detail.metadata.status === 'Completed' && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setActiveExperimentId(detail.metadata.experiment_id);
                              navigate(
                                `/experiments/results?id=${encodeURIComponent(
                                  detail.metadata.experiment_id,
                                )}`,
                              );
                            }}
                          >
                            <span>Load into Active Results View</span>
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        )}
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={minicertApi.getExportCsvUrl(detail.metadata.experiment_id)}
                            download={`${detail.metadata.experiment_id}_samples.csv`}
                          >
                            <FileSpreadsheet
                              className="h-3.5 w-3.5 text-[#627D68]"
                              aria-hidden="true"
                            />
                            <span>samples.csv</span>
                            <Download className="h-3 w-3 text-[#827875]" aria-hidden="true" />
                          </a>
                        </Button>
                        <Button asChild variant="outline" size="sm">
                          <a
                            href={minicertApi.getExportJsonUrl(detail.metadata.experiment_id)}
                            download={`${detail.metadata.experiment_id}_summary.json`}
                          >
                            <FileJson className="h-3.5 w-3.5 text-[#702B3A]" aria-hidden="true" />
                            <span>summary.json</span>
                            <Download className="h-3 w-3 text-[#827875]" aria-hidden="true" />
                          </a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {detail.metadata.error_message && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-[#9A6700]/40 bg-[#9A6700]/8 px-4 py-3 text-xs text-[#30282A]">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#9A6700]"
                      aria-hidden="true"
                    />
                    <div>
                      <strong>Integrity Note:</strong> {detail.metadata.error_message}
                    </div>
                  </div>
                )}

                {!detail.loadable ? (
                  <EmptyState
                    icon={<AlertTriangle className="h-5 w-5 text-[#9A6700]" aria-hidden="true" />}
                    title={`Experiment is ${detail.metadata.status}`}
                    description="Incomplete or corrupted experiment directories are preserved for diagnostics and are never treated as valid completed results."
                  />
                ) : (
                  <>
                    {/* Config JSON Toggle */}
                    {detail.config && (
                      <div className="rounded-xl border border-[#E5DCD3] bg-[#FFFCF8] p-4">
                        <button
                          type="button"
                          onClick={() => setShowConfigJson((v) => !v)}
                          aria-expanded={showConfigJson}
                          className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#30282A] hover:text-[#702B3A]"
                        >
                          <span>Stored Configuration JSON</span>
                          {showConfigJson ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {showConfigJson && (
                          <pre className="mt-3 overflow-x-auto rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] p-3 font-mono-tabular text-xs text-[#30282A]">
                            {JSON.stringify(detail.config, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Aggregated Metrics by Epsilon */}
                    {detail.metrics.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-[#30282A]">
                          Aggregated Metrics by Epsilon
                        </h3>
                        {detail.metrics.map((entry) => {
                          const cert = entry.certification;
                          return (
                            <div
                              key={entry.epsilon}
                              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                            >
                              <MetricCard
                                label={`Baseline Rate (ε=${entry.epsilon})`}
                                value={formatPercentFromFraction(cert.baseline_rate)}
                                tone="muted"
                              />
                              <MetricCard
                                label={`Refined Rate (ε=${entry.epsilon})`}
                                value={formatPercentFromFraction(cert.refined_rate)}
                              />
                              <MetricCard
                                label={`Improvement (ε=${entry.epsilon})`}
                                value={formatImprovementPp(cert.improvement_pp)}
                                tone={
                                  cert.improvement_pp !== null && cert.improvement_pp > 0
                                    ? 'positive'
                                    : 'muted'
                                }
                              />
                              <MetricCard
                                label={`Inconclusive (ε=${entry.epsilon})`}
                                value={`${cert.baseline_inconclusive} / ${cert.refined_inconclusive}`}
                                sublabel="Baseline / Refined"
                                tone="muted"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Historical Visualizations */}
                    {detail.charts && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-[#30282A]">
                          Historical Visualizations
                        </h3>
                        <ExperimentChartsTabs
                          charts={detail.charts}
                          keyPrefix={`history-${detail.metadata.experiment_id}`}
                        />
                      </div>
                    )}

                    {/* Expandable Historical Per-Sample Table */}
                    <div className="rounded-xl border border-[#E5DCD3] bg-[#FFFCF8] p-4">
                      <button
                        type="button"
                        onClick={() => setShowSampleTable((v) => !v)}
                        aria-expanded={showSampleTable}
                        className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#30282A] hover:text-[#702B3A]"
                      >
                        <span>
                          Historical Per-Sample Records ({detail.records.length} rows)
                        </span>
                        {showSampleTable ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {showSampleTable && (
                        <div className="mt-4">
                          <SampleRecordsTable
                            records={detail.records}
                            caption={`Historical records for ${detail.metadata.experiment_id}`}
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Download, FileJson, FileSpreadsheet, FlaskConical } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { minicertApi } from '@/api/endpoints';
import type { ExperimentMetadataDTO, ExperimentResultsResponse } from '@/api/types';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { ExperimentChartsTabs } from '@/components/common/ExperimentChartsTabs';
import { ExportMenu } from '@/components/common/ExportMenu';
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
  formatOptionalNumber,
  formatPercentFromFraction,
  formatTimestamp,
} from '@/lib/formatters';

export function ExperimentResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeExperimentId, setActiveExperimentId } = useWorkspace();

  const queryId = searchParams.get('id');
  const selectedId = queryId || activeExperimentId;

  const [availableRuns, setAvailableRuns] = useState<ExperimentMetadataDTO[]>([]);
  const [rawResults, setRawResults] = useState<ExperimentResultsResponse | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState<number>(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const expectedKey = selectedId ? `${selectedId}:${reloadTick}` : null;
  const loading = Boolean(expectedKey && loadedKey !== expectedKey);
  const results = selectedId ? rawResults : null;
  const error = selectedId ? rawError : null;

  // Sync URL ?id= into activeExperimentId
  useEffect(() => {
    if (queryId && queryId !== activeExperimentId) {
      setActiveExperimentId(queryId);
    }
  }, [queryId, activeExperimentId, setActiveExperimentId]);

  // Fetch list of loadable experiments for quick switcher
  useEffect(() => {
    const controller = new AbortController();
    minicertApi
      .getHistory(controller.signal)
      .then((res) => {
        setAvailableRuns(
          res.experiments.filter((e) => e.status === 'Completed' || e.status === 'Failed'),
        );
      })
      .catch(() => {
        // Non-fatal; switcher stays empty if unavailable
      });
    return () => controller.abort();
  }, [reloadTick]);

  // Load read-only results for selectedId
  useEffect(() => {
    if (!selectedId || !expectedKey) {
      return;
    }

    const controller = new AbortController();

    minicertApi
      .getExperimentResults(selectedId, controller.signal)
      .then((data) => {
        setRawResults(data);
        setRawError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setRawResults(null);
        setRawError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : 'Failed to load experiment results.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadedKey(expectedKey);
        }
      });

    return () => controller.abort();
  }, [selectedId, expectedKey]);

  const handleSelectExperiment = (id: string) => {
    setActiveExperimentId(id);
    setSearchParams({ id });
  };

  return (
    <div>
      <PageHeader
        kicker="Active Run Analytics"
        title="Experiment Results"
        description="Read-only analytical evaluation of certification rates, logit interval width tightening, solver runtime, and per-sample verification records."
        breadcrumbs={[{ label: 'Workspace', to: '/' }, { label: 'Experiment Results' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {availableRuns.length > 0 && (
              <select
                aria-label="Select experiment to view"
                value={selectedId ?? ''}
                onChange={(e) => handleSelectExperiment(e.target.value)}
                className="rounded-lg border border-[#E5DCD3] bg-[#FFFCF8] px-3 py-1.5 font-mono-tabular text-xs text-[#30282A]"
              >
                {availableRuns.map((run) => (
                  <option key={run.experiment_id} value={run.experiment_id}>
                    {run.experiment_id} ({run.experiment_type})
                  </option>
                ))}
              </select>
            )}
            {results && (
              <ExportMenu
                label="Download Artifacts"
                options={[
                  {
                    id: 'csv',
                    label: 'Per-Sample Records (CSV)',
                    kind: 'csv',
                    href: minicertApi.getExportCsvUrl(results.metadata.experiment_id),
                    downloadName: `${results.metadata.experiment_id}_samples.csv`,
                  },
                  {
                    id: 'json',
                    label: 'Aggregated Summary (JSON)',
                    kind: 'json',
                    href: minicertApi.getExportJsonUrl(results.metadata.experiment_id),
                    downloadName: `${results.metadata.experiment_id}_summary.json`,
                  },
                ]}
              />
            )}
          </div>
        }
      />

      {!selectedId ? (
        <EmptyState
          icon={<FlaskConical className="h-5 w-5" aria-hidden="true" />}
          title="No Experiment Loaded"
          description="Run a new experiment or select an existing run from Experiment History to inspect charts and per-sample records."
          action={
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to="/experiments/new">Run New Experiment</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/experiments/history">Browse History</Link>
              </Button>
            </div>
          }
        />
      ) : loading ? (
        <LoadingState
          label={`Loading experiment "${selectedId}"…`}
          description="Reading persisted summary and per-sample records without re-running verification."
        />
      ) : error ? (
        <ErrorState
          title={`Unable to load experiment "${selectedId}"`}
          message={error}
          onRetry={() => setReloadTick((t) => t + 1)}
        />
      ) : results ? (
        <div className="space-y-8">
          {/* Active Experiment Identifier Card */}
          <Card className="border-l-4 border-l-[#702B3A]">
            <CardContent className="flex flex-col gap-3 pt-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#702B3A]">
                    Active Experiment
                  </span>
                  <StatusBadge status={results.metadata.status} />
                  <span className="rounded border border-[#E5DCD3] bg-[#F1EAE2] px-2 py-0.5 text-[11px] font-medium capitalize text-[#51494A]">
                    {results.metadata.experiment_type}
                  </span>
                </div>
                <h2 className="font-mono-tabular mt-1 text-lg font-semibold text-[#30282A]">
                  {results.metadata.experiment_id}
                </h2>
                <p className="mt-1 text-xs text-[#51494A]">
                  Evaluated{' '}
                  <strong>
                    {results.sample_selection.selected ?? results.metadata.sample_count} correctly
                    classified samples
                  </strong>{' '}
                  (excluded {results.sample_selection.incorrect_excluded ?? 0} misclassified) across{' '}
                  <strong>{results.metrics.length} perturbation radii</strong> with seed{' '}
                  <code className="font-mono-tabular">{results.metadata.seed}</code>.
                </p>
              </div>
              <div className="font-mono-tabular text-xs text-[#827875]">
                <div>Name: {results.metadata.experiment_name}</div>
                <div>Recorded: {formatTimestamp(results.metadata.timestamp)}</div>
              </div>
            </CardContent>
          </Card>

          {/* Aggregated Summary by Perturbation Radius */}
          <section>
            <SectionHeader
              kicker="Aggregated Metrics"
              title="Summary by Perturbation Radius (ε)"
            />
            <div className="space-y-5">
              {results.metrics.map((entry) => {
                const cert = entry.certification;
                const bounds = entry.bounds;
                return (
                  <div key={entry.epsilon} className="space-y-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-mono-tabular text-sm font-semibold text-[#30282A]">
                        Perturbation Radius ε = {entry.epsilon}
                      </h3>
                      <span className="font-mono-tabular text-xs text-[#827875]">
                        Mean width: {formatOptionalNumber(bounds.mean_baseline_width)} →{' '}
                        {formatOptionalNumber(bounds.mean_refined_width)} · Inconclusive:{' '}
                        {cert.baseline_inconclusive} base / {cert.refined_inconclusive} refined
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <MetricCard
                        label="Baseline Certified"
                        value={formatPercentFromFraction(cert.baseline_rate)}
                        sublabel={`${cert.baseline_certified} / ${cert.evaluated_samples} samples`}
                        tone="muted"
                      />
                      <MetricCard
                        label="Refined Certified"
                        value={formatPercentFromFraction(cert.refined_rate)}
                        sublabel={`${cert.refined_certified} / ${cert.evaluated_samples} samples`}
                      />
                      <MetricCard
                        label="Improvement Delta"
                        value={formatImprovementPp(cert.improvement_pp)}
                        sublabel="Refined − Baseline"
                        tone={
                          cert.improvement_pp !== null && cert.improvement_pp > 0
                            ? 'positive'
                            : 'muted'
                        }
                      />
                      <MetricCard
                        label="Verification Errors"
                        value={cert.baseline_errors + cert.refined_errors}
                        sublabel={`${cert.baseline_errors} base · ${cert.refined_errors} refined`}
                        tone={
                          cert.baseline_errors + cert.refined_errors > 0 ? 'warning' : 'muted'
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 4 Analytical Chart Tabs */}
          <section>
            <SectionHeader
              kicker="Analytical Visualizations"
              title="Interactive Evaluation Charts"
              description="Four analytical views rendered from persisted experiment metrics, including accessible numerical data and PNG/CSV export."
            />
            <ExperimentChartsTabs
              charts={results.charts}
              keyPrefix={`results-${results.metadata.experiment_id}`}
            />
          </section>

          {/* Full Per-Sample Verification Records Table */}
          <section>
            <SectionHeader
              kicker="Sample-Level Audit Trail"
              title="Per-Sample Verification Records"
              description="Sort, filter by ε or verdict status, paginate, and toggle optional metrics across all evaluated records."
            />
            <SampleRecordsTable records={results.records} />
          </section>

          {/* Read-Only Artifact Downloads */}
          <section>
            <SectionHeader
              kicker="Read-Only Artifacts"
              title="Download Persisted CSV & JSON Files"
              description="Downloads stream the exact persisted samples.csv and summary.json artifacts from disk without regenerating or mutating files."
            />
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a
                  href={minicertApi.getExportCsvUrl(results.metadata.experiment_id)}
                  download={`${results.metadata.experiment_id}_samples.csv`}
                >
                  <FileSpreadsheet className="h-4 w-4 text-[#627D68]" aria-hidden="true" />
                  <span>Download Per-Sample Records (CSV)</span>
                  <Download className="h-3.5 w-3.5 text-[#827875]" aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a
                  href={minicertApi.getExportJsonUrl(results.metadata.experiment_id)}
                  download={`${results.metadata.experiment_id}_summary.json`}
                >
                  <FileJson className="h-4 w-4 text-[#702B3A]" aria-hidden="true" />
                  <span>Download Aggregated Summary (JSON)</span>
                  <Download className="h-3.5 w-3.5 text-[#827875]" aria-hidden="true" />
                </a>
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

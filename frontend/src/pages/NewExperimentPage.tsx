import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, FlaskConical, Loader2, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { minicertApi } from '@/api/endpoints';
import type { ExperimentJobStatusResponse } from '@/api/types';
import { ConfirmationDialog } from '@/components/common/ConfirmationDialog';
import { ErrorState } from '@/components/common/ErrorState';
import { MetricCard } from '@/components/common/MetricCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SectionHeader } from '@/components/common/SectionHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspace } from '@/context/WorkspaceContext';
import { formatSeconds, formatTimestamp } from '@/lib/formatters';

function parseEpsilonTextClient(text: string): { values: number[] | null; error: string | null } {
  const entries = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (entries.length === 0) {
    return { values: null, error: 'At least one epsilon value is required.' };
  }
  const parsed: number[] = [];
  for (const entry of entries) {
    const num = Number(entry);
    if (!Number.isFinite(num)) {
      return { values: null, error: `Invalid epsilon value: "${entry}"` };
    }
    if (num < 0) {
      return { values: null, error: `Epsilon values must be nonnegative, got ${num}` };
    }
    parsed.push(num);
  }
  return { values: parsed, error: null };
}

export function NewExperimentPage() {
  const { overview, activeJobId, setActiveJobId, setActiveExperimentId, refreshWorkspace } =
    useWorkspace();
  const maxSamples = overview?.dataset.total_samples ?? 10000;

  const [sampleCountText, setSampleCountText] = useState<string>('20');
  const [epsilonText, setEpsilonText] = useState<string>('0.01, 0.03, 0.05, 0.1');
  const [seedText, setSeedText] = useState<string>('42');
  const [experimentName, setExperimentName] = useState<string>('');

  const [confirmMode, setConfirmMode] = useState<'development' | 'configured' | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [jobStatus, setJobStatus] = useState<ExperimentJobStatusResponse | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [transportMode, setTransportMode] = useState<'sse' | 'polling' | 'idle'>('idle');

  const submitAbortRef = useRef<AbortController | null>(null);

  // Client-side validation for Configured mode
  const parsedSampleCount = Number(sampleCountText);
  const sampleCountError = useMemo(() => {
    if (sampleCountText.trim() === '' || !Number.isInteger(parsedSampleCount)) {
      return 'Sample count must be an integer.';
    }
    if (parsedSampleCount < 1 || parsedSampleCount > maxSamples) {
      return `Sample count must be between 1 and ${maxSamples.toLocaleString()}.`;
    }
    return null;
  }, [sampleCountText, parsedSampleCount, maxSamples]);

  const parsedSeed = Number(seedText);
  const seedError = useMemo(() => {
    const seedVal = Number(seedText);
    if (seedText.trim() === '' || !Number.isInteger(seedVal)) {
      return 'Random seed must be an integer.';
    }
    if (seedVal < 0 || seedVal > 2147483647) {
      return 'Random seed must be between 0 and 2,147,483,647.';
    }
    return null;
  }, [seedText]);

  const parsedEps = useMemo(() => parseEpsilonTextClient(epsilonText), [epsilonText]);

  const configuredValid = !sampleCountError && !seedError && !parsedEps.error;
  const configuredTotalPairs =
    configuredValid && parsedEps.values ? parsedSampleCount * parsedEps.values.length : 0;

  // Subscribe to SSE progress + polling fallback for activeJobId
  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    let eventSource: EventSource | null = null;
    const statusAbort = new AbortController();

    const handleTerminal = (payload: ExperimentJobStatusResponse) => {
      setJobStatus(payload);
      setTransportMode('idle');
      if (payload.status === 'COMPLETED') {
        setActiveExperimentId(payload.experiment_id);
        refreshWorkspace();
      }
    };

    const startPolling = () => {
      if (cancelled) {
        return;
      }

      const pollOnce = async () => {
        if (cancelled) {
          return;
        }
        try {
          const snapshot = await minicertApi.getExperimentStatus(
            activeJobId,
            statusAbort.signal,
          );
          if (cancelled) {
            return;
          }
          setTransportMode('polling');
          setStreamError(null);
          if (snapshot.status === 'COMPLETED' || snapshot.status === 'FAILED') {
            handleTerminal(snapshot);
            return;
          }
          setJobStatus(snapshot);
          pollTimer = window.setTimeout(pollOnce, 1500);
        } catch (err: unknown) {
          if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) {
            return;
          }
          if (err instanceof ApiError && err.status === 404) {
            setStreamError(
              `Job "${activeJobId}" is no longer present in backend memory (possibly restarted).`,
            );
            setTransportMode('idle');
            setActiveJobId(null);
            return;
          }
          setTransportMode('polling');
          setStreamError(
            err instanceof Error ? err.message : 'Status polling failed; retrying…',
          );
          pollTimer = window.setTimeout(pollOnce, 3000);
        }
      };

      void pollOnce();
    };

    // Prefer SSE stream; fall back cleanly to polling on disconnect/error
    if (typeof window.EventSource !== 'undefined') {
      eventSource = new EventSource(minicertApi.getExperimentEventsUrl(activeJobId));

      eventSource.onopen = () => {
        if (!cancelled) {
          setTransportMode('sse');
          setStreamError(null);
        }
      };

      const onProgressEvent = (ev: MessageEvent<string>) => {
        if (cancelled) {
          return;
        }
        try {
          const payload = JSON.parse(ev.data) as ExperimentJobStatusResponse;
          setTransportMode('sse');
          setStreamError(null);
          if (payload.status === 'COMPLETED' || payload.status === 'FAILED') {
            eventSource?.close();
            eventSource = null;
            handleTerminal(payload);
          } else {
            setJobStatus(payload);
          }
        } catch {
          // Ignore malformed event chunk
        }
      };

      eventSource.addEventListener('status', onProgressEvent);
      eventSource.addEventListener('progress', onProgressEvent);
      eventSource.addEventListener('completed', onProgressEvent);
      eventSource.addEventListener('failed', onProgressEvent);

      eventSource.onerror = () => {
        if (cancelled) {
          return;
        }
        eventSource?.close();
        eventSource = null;
        startPolling();
      };
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      statusAbort.abort();
      if (eventSource) {
        eventSource.close();
      }
      if (pollTimer !== null) {
        window.clearTimeout(pollTimer);
      }
    };
  }, [activeJobId, refreshWorkspace, setActiveExperimentId, setActiveJobId]);

  useEffect(() => {
    return () => {
      submitAbortRef.current?.abort();
    };
  }, []);

  const submitExperiment = async (mode: 'development' | 'configured') => {
    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;

    setSubmitting(true);
    setSubmitError(null);
    setStreamError(null);
    setJobStatus(null);

    try {
      const payload =
        mode === 'development'
          ? {
              experiment_type: 'development' as const,
            }
          : {
              experiment_type: 'configured' as const,
              sample_count: parsedSampleCount,
              epsilons: parsedEps.values ?? [],
              seed: parsedSeed,
              experiment_name: experimentName.trim(),
            };

      const accepted = await minicertApi.createExperiment(payload, controller.signal);
      setActiveJobId(accepted.experiment_id);
      setJobStatus({
        experiment_id: accepted.experiment_id,
        status: accepted.status,
        stage: 'queued',
        experiment_type: accepted.experiment_type,
        completed_pairs: 0,
        total_pairs: accepted.total_pairs,
        progress_percent: 0,
        current_epsilon: null,
        current_sample_index: null,
        elapsed_seconds: 0,
        created_at: accepted.created_at,
        started_at: null,
        finished_at: null,
        error: null,
        metadata: null,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setSubmitError(
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : 'Failed to enqueue verification experiment.',
      );
    } finally {
      if (!controller.signal.aborted) {
        setSubmitting(false);
      }
    }
  };

  const isJobActive = jobStatus?.status === 'QUEUED' || jobStatus?.status === 'RUNNING';

  return (
    <div>
      <PageHeader
        kicker="Evaluation Benchmark Runner"
        title="Configure New Experiment"
        description="Enqueue reproducible baseline IBP versus L4-only LP-refined verification benchmarks across deterministic MNIST test subsets."
        breadcrumbs={[{ label: 'Workspace', to: '/' }, { label: 'New Experiment' }]}
      />

      {/* 1. Benchmark Parameters */}
      <section className="mb-8">
        <SectionHeader
          kicker="Step 1 · Experiment Parameters"
          title="Configured Research Evaluation"
          description="Only correctly classified test samples are evaluated. Each sample-epsilon pair executes baseline IBP and L4-only LP-refined verification on identical input boxes."
        />

        <Card>
          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="exp-sample-count"
                  className="block text-xs font-semibold uppercase tracking-[0.06em] text-[#51494A]"
                >
                  Sample Count
                </label>
                <input
                  id="exp-sample-count"
                  type="number"
                  min={1}
                  max={maxSamples}
                  step={5}
                  value={sampleCountText}
                  onChange={(e) => setSampleCountText(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-3 py-2 font-mono-tabular text-sm text-[#30282A]"
                />
                {sampleCountError ? (
                  <p className="mt-1 text-xs text-[#B3261E]">{sampleCountError}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-[#827875]">
                    Correctly classified digits (1 – {maxSamples.toLocaleString()}).
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="exp-epsilons"
                  className="block text-xs font-semibold uppercase tracking-[0.06em] text-[#51494A]"
                >
                  Perturbation Radii ε
                </label>
                <input
                  id="exp-epsilons"
                  type="text"
                  value={epsilonText}
                  onChange={(e) => setEpsilonText(e.target.value)}
                  placeholder="0.01, 0.03, 0.05, 0.1"
                  className="mt-1.5 w-full rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-3 py-2 font-mono-tabular text-sm text-[#30282A]"
                />
                {parsedEps.error ? (
                  <p className="mt-1 text-xs text-[#B3261E]">{parsedEps.error}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-[#827875]">
                    Comma-separated finite nonnegative radii.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="exp-seed"
                  className="block text-xs font-semibold uppercase tracking-[0.06em] text-[#51494A]"
                >
                  Random Seed
                </label>
                <input
                  id="exp-seed"
                  type="number"
                  min={0}
                  max={2147483647}
                  step={1}
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-3 py-2 font-mono-tabular text-sm text-[#30282A]"
                />
                {seedError ? (
                  <p className="mt-1 text-xs text-[#B3261E]">{seedError}</p>
                ) : (
                  <p className="mt-1 text-[11px] text-[#827875]">
                    Controls deterministic sample selection order.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="exp-name"
                  className="block text-xs font-semibold uppercase tracking-[0.06em] text-[#51494A]"
                >
                  Experiment Name (Optional)
                </label>
                <input
                  id="exp-name"
                  type="text"
                  value={experimentName}
                  onChange={(e) => setExperimentName(e.target.value)}
                  placeholder="Auto: evaluation_seed{seed}_n{n}"
                  className="mt-1.5 w-full rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-3 py-2 text-sm text-[#30282A] placeholder:text-[#827875]"
                />
                <p className="mt-1 text-[11px] text-[#827875]">
                  Storage receives a unique collision-proof ID.
                </p>
              </div>
            </div>

            {configuredValid && configuredTotalPairs >= 200 && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[#9A6700]/40 bg-[#9A6700]/8 px-4 py-3 text-xs text-[#30282A]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#9A6700]" aria-hidden="true" />
                <div>
                  <strong>Long Execution Warning:</strong> This configuration evaluates{' '}
                  <span className="font-mono-tabular font-semibold">
                    {configuredTotalPairs.toLocaleString()}
                  </span>{' '}
                  sample-epsilon pairs (~
                  <span className="font-mono-tabular font-semibold">
                    {(configuredTotalPairs * 20).toLocaleString()}
                  </span>{' '}
                  L4 LP solves). Execution on CPU may take several minutes.
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EFE9E1] pt-4">
              <div className="text-xs text-[#51494A]">
                Estimated workload:{' '}
                <strong className="font-mono-tabular text-[#30282A]">
                  {configuredTotalPairs.toLocaleString()}
                </strong>{' '}
                pairs ·{' '}
                <strong className="font-mono-tabular text-[#30282A]">
                  {(configuredTotalPairs * 20).toLocaleString()}
                </strong>{' '}
                L4 LP solves (single-worker serial queue).
              </div>
              <Button
                type="button"
                disabled={!configuredValid || submitting || isJobActive}
                onClick={() => setConfirmMode('configured')}
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Run Configured Experiment
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 2. Development Preset */}
      <section className="mb-8">
        <SectionHeader
          kicker="Step 2 · Smoke / Development Preset"
          title="Small-Sample Development Test Run"
          description="Clearly distinguished from research evaluations: uses the backend's fixed development preset (5 samples, ε = 0.03, seed = 42) to verify end-to-end execution quickly."
        />

        <Card>
          <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-[#702B3A]" aria-hidden="true" />
                <span className="text-sm font-semibold text-[#30282A]">
                  Development Preset (Non-Research Smoke Run)
                </span>
              </div>
              <p className="font-mono-tabular text-xs text-[#51494A]">
                experiment_type = &quot;development&quot; · sample_count = 5 · epsilons = [0.03] ·
                seed = 42 · 5 pairs (100 LP solves)
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={submitting || isJobActive}
              onClick={() => setConfirmMode('development')}
            >
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Run Development Test (5 samples)
            </Button>
          </CardContent>
        </Card>
      </section>

      {submitError && (
        <div className="mb-6">
          <ErrorState title="Experiment submission rejected" message={submitError} />
        </div>
      )}

      {/* 3. Live Job Progress & Status */}
      {jobStatus && (
        <section>
          <SectionHeader
            kicker="Step 3 · Background Execution Monitor"
            title="Experiment Job Progress"
            description="Streaming real-time updates via Server-Sent Events (SSE) with automatic polling fallback. Note: active job progress lives in single-process backend memory; completed artifacts are persisted atomically to disk."
          />

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#827875]">
                  Experiment ID
                </p>
                <CardTitle className="font-mono-tabular text-base">
                  {jobStatus.experiment_id}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {transportMode !== 'idle' && (
                  <span className="rounded border border-[#E5DCD3] bg-[#F1EAE2] px-2 py-0.5 font-mono-tabular text-[10px] font-semibold uppercase text-[#51494A]">
                    {transportMode === 'sse' ? 'SSE Live' : 'Polling Fallback'}
                  </span>
                )}
                <StatusBadge status={jobStatus.status} />
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Progress Bar */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-[#51494A]">
                  <span className="flex items-center gap-1.5 font-medium">
                    {isJobActive && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#702B3A]" aria-hidden="true" />
                    )}
                    Stage: <span className="font-mono-tabular">{jobStatus.stage}</span>
                    {jobStatus.current_epsilon !== null && (
                      <span className="font-mono-tabular text-[#827875]">
                        (ε = {jobStatus.current_epsilon}, sample #{jobStatus.current_sample_index ?? '—'})
                      </span>
                    )}
                  </span>
                  <span className="font-mono-tabular font-semibold text-[#30282A]">
                    {jobStatus.completed_pairs} / {jobStatus.total_pairs} pairs (
                    {jobStatus.progress_percent.toFixed(1)}%)
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(jobStatus.progress_percent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2.5 w-full overflow-hidden rounded-full bg-[#EFE9E1]"
                >
                  <div
                    className={`h-full transition-all duration-300 ${
                      jobStatus.status === 'FAILED'
                        ? 'bg-[#B3261E]'
                        : jobStatus.status === 'COMPLETED'
                          ? 'bg-[#1E7A34]'
                          : 'bg-[#702B3A]'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, jobStatus.progress_percent))}%` }}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard
                  label="Experiment Type"
                  value={jobStatus.experiment_type}
                  sublabel={`Created: ${formatTimestamp(jobStatus.created_at)}`}
                  tone="muted"
                />
                <MetricCard
                  label="Elapsed Time"
                  value={formatSeconds(jobStatus.elapsed_seconds, 2)}
                  sublabel={
                    jobStatus.finished_at
                      ? `Finished: ${formatTimestamp(jobStatus.finished_at)}`
                      : 'Running on single-worker queue'
                  }
                  tone="muted"
                />
                <MetricCard
                  label="Completed Pairs"
                  value={`${jobStatus.completed_pairs} / ${jobStatus.total_pairs}`}
                  sublabel={`${jobStatus.progress_percent.toFixed(1)}% complete`}
                />
              </div>

              {streamError && (
                <ErrorState title="Connection notice" message={streamError} />
              )}

              {jobStatus.status === 'FAILED' && (
                <ErrorState
                  title="Experiment failed during execution"
                  message={jobStatus.error ?? 'Unknown execution error.'}
                />
              )}

              {jobStatus.status === 'COMPLETED' && (
                <div className="flex flex-col gap-3 rounded-xl border border-[#1E7A34]/35 bg-[#1E7A34]/8 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5 text-sm text-[#30282A]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1E7A34]" aria-hidden="true" />
                    <div>
                      <strong>Experiment Persisted:</strong>{' '}
                      <code className="font-mono-tabular">{jobStatus.experiment_id}</code>{' '}
                      completed and saved atomically to disk.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm">
                      <Link
                        to={`/experiments/results?id=${encodeURIComponent(jobStatus.experiment_id)}`}
                      >
                        <span>View Results</span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/experiments/history">Open History</Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <ConfirmationDialog
        open={confirmMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmMode(null);
          }
        }}
        title={
          confirmMode === 'development'
            ? 'Run Development Test Preset?'
            : 'Start Configured Verification Experiment?'
        }
        description={
          confirmMode === 'development'
            ? 'This queues a small-sample development test run (5 samples, ε = 0.03, seed = 42, 100 L4 LP solves). It is labeled as a development run and persisted separately in experiment history.'
            : `This queues a configured evaluation of ${parsedSampleCount.toLocaleString()} samples across ${
                parsedEps.values?.length ?? 0
              } perturbation radii (${configuredTotalPairs.toLocaleString()} pairs, ~${(
                configuredTotalPairs * 20
              ).toLocaleString()} L4 LP solves).${
                configuredTotalPairs >= 200
                  ? ' Because this exceeds 200 pairs, execution may take several minutes on CPU.'
                  : ''
              }`
        }
        confirmLabel="Queue Experiment"
        onConfirm={() => {
          if (confirmMode) {
            void submitExperiment(confirmMode);
          }
        }}
      />
    </div>
  );
}

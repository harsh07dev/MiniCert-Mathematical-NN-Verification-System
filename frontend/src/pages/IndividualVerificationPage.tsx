import { useEffect, useMemo, useRef, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Info, Play, ShieldCheck } from 'lucide-react';
import { ApiError } from '@/api/client';
import { minicertApi } from '@/api/endpoints';
import type {
  ClassBoundRowDTO,
  SamplePreviewResponse,
  VerificationMode,
  VerificationResponse,
} from '@/api/types';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { LoadingState } from '@/components/common/LoadingState';
import { MetricCard } from '@/components/common/MetricCard';
import { PageHeader } from '@/components/common/PageHeader';
import { SectionHeader } from '@/components/common/SectionHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWorkspace } from '@/context/WorkspaceContext';
import { formatOptionalNumber, formatSeconds } from '@/lib/formatters';

function MnistDigitCanvas({ matrix }: { matrix: number[][] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || matrix.length === 0) {
      return;
    }
    const height = matrix.length;
    const width = matrix[0]?.length ?? 0;
    if (width === 0) {
      return;
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const imgData = ctx.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const val = Math.max(0, Math.min(1, matrix[y][x] ?? 0));
        const gray = Math.round(val * 255);
        const offset = (y * width + x) * 4;
        imgData.data[offset] = gray;
        imgData.data[offset + 1] = gray;
        imgData.data[offset + 2] = gray;
        imgData.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [matrix]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="MNIST test digit preview"
      className="h-36 w-36 rounded-lg border border-[#E5DCD3] bg-black"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

function buildCacheKey(index: number, eps: number, mode: VerificationMode): string {
  return `${index}:${eps.toFixed(6)}:${mode}`;
}

export function IndividualVerificationPage() {
  const { overview } = useWorkspace();
  const maxSampleIndex = Math.max(0, (overview?.dataset.total_samples ?? 10000) - 1);

  const [sampleIndex, setSampleIndex] = useState<number>(0);
  const [sampleInput, setSampleInput] = useState<string>('0');
  const [epsilon, setEpsilon] = useState<number>(0.03);
  const [epsilonInput, setEpsilonInput] = useState<string>('0.030');

  const [preview, setPreview] = useState<SamplePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [cache, setCache] = useState<Record<string, VerificationResponse>>({});
  const [verifyingMode, setVerifyingMode] = useState<VerificationMode | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const verifyAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef<number>(0);

  // Fetch MNIST sample preview when sampleIndex changes
  useEffect(() => {
    const controller = new AbortController();
    minicertApi
      .getSamplePreview(sampleIndex, controller.signal)
      .then((data) => {
        setPreview(data);
        setPreviewError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        setPreviewError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : 'Failed to load MNIST sample.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPreviewLoading(false);
        }
      });

    return () => controller.abort();
  }, [sampleIndex]);

  // Abort any in-flight verification request on unmount or key change
  useEffect(() => {
    return () => {
      verifyAbortRef.current?.abort();
    };
  }, []);

  const commitSampleIndex = (raw: string) => {
    setSampleInput(raw);
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= maxSampleIndex) {
      if (parsed !== sampleIndex) {
        verifyAbortRef.current?.abort();
        setVerifyingMode(null);
        setVerifyError(null);
        setPreviewLoading(true);
        setSampleIndex(parsed);
      }
    }
  };

  const stepSampleIndex = (delta: number) => {
    const next = Math.max(0, Math.min(maxSampleIndex, sampleIndex + delta));
    commitSampleIndex(String(next));
  };

  const commitEpsilon = (raw: string) => {
    setEpsilonInput(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      if (parsed !== epsilon) {
        verifyAbortRef.current?.abort();
        setVerifyingMode(null);
        setVerifyError(null);
        setEpsilon(parsed);
      }
    }
  };

  const sampleValidationError = useMemo(() => {
    const parsed = Number(sampleInput);
    if (sampleInput.trim() === '' || !Number.isInteger(parsed)) {
      return 'Sample index must be an integer.';
    }
    if (parsed < 0 || parsed > maxSampleIndex) {
      return `Sample index must be between 0 and ${maxSampleIndex}.`;
    }
    return null;
  }, [sampleInput, maxSampleIndex]);

  const epsilonValidationError = useMemo(() => {
    const parsed = Number(epsilonInput);
    if (epsilonInput.trim() === '' || !Number.isFinite(parsed)) {
      return 'Perturbation epsilon must be a finite number.';
    }
    if (parsed < 0) {
      return 'Perturbation epsilon must be nonnegative.';
    }
    return null;
  }, [epsilonInput]);

  const runVerification = (mode: VerificationMode) => {
    if (sampleValidationError || epsilonValidationError) {
      return;
    }

    const key = buildCacheKey(sampleIndex, epsilon, mode);
    if (cache[key]) {
      setVerifyError(null);
      return;
    }

    verifyAbortRef.current?.abort();
    const controller = new AbortController();
    verifyAbortRef.current = controller;
    const seq = ++requestSeqRef.current;

    setVerifyingMode(mode);
    setVerifyError(null);

    minicertApi
      .verifySample(
        {
          sample_index: sampleIndex,
          epsilon,
          mode,
        },
        controller.signal,
      )
      .then((res) => {
        if (seq !== requestSeqRef.current) {
          return;
        }
        setCache((prev) => ({
          ...prev,
          [key]: res,
        }));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (seq !== requestSeqRef.current) {
          return;
        }
        setVerifyError(
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : 'Verification request failed.',
        );
      })
      .finally(() => {
        if (seq === requestSeqRef.current && !controller.signal.aborted) {
          setVerifyingMode(null);
        }
      });
  };

  // Resolve cached baseline & refined responses for the active (sampleIndex, epsilon)
  const bothOutcome = cache[buildCacheKey(sampleIndex, epsilon, 'both')] ?? null;
  const baselineOnlyOutcome =
    cache[buildCacheKey(sampleIndex, epsilon, 'baseline')] ?? null;
  const refinedOnlyOutcome =
    cache[buildCacheKey(sampleIndex, epsilon, 'refined')] ?? null;

  const activeBaseline = bothOutcome?.baseline ?? baselineOnlyOutcome?.baseline ?? refinedOnlyOutcome?.baseline ?? null;
  const activeRefined = bothOutcome?.refined ?? refinedOnlyOutcome?.refined ?? null;
  const activeOutcome = bothOutcome ?? refinedOnlyOutcome ?? baselineOnlyOutcome;

  // Build display rows from backend-supplied per_class_bounds (zero math in React)
  const boundRows = useMemo<ClassBoundRowDTO[]>(() => {
    if (bothOutcome) {
      return bothOutcome.per_class_bounds;
    }
    if (baselineOnlyOutcome && refinedOnlyOutcome) {
      return baselineOnlyOutcome.per_class_bounds.map((baseRow, idx) => {
        const refRow = refinedOnlyOutcome.per_class_bounds[idx];
        const bW = baseRow.baseline_width;
        const rW = refRow?.refined_width ?? null;
        let tightening: number | null = null;
        if (bW !== null && rW !== null) {
          tightening = bW > 0 ? ((bW - rW) / bW) * 100 : 0;
        }
        return {
          ...baseRow,
          refined_lower: refRow?.refined_lower ?? null,
          refined_upper: refRow?.refined_upper ?? null,
          refined_width: rW,
          width_tightening_pct: tightening,
        };
      });
    }
    if (refinedOnlyOutcome) {
      return refinedOnlyOutcome.per_class_bounds;
    }
    if (baselineOnlyOutcome) {
      return baselineOnlyOutcome.per_class_bounds;
    }
    return [];
  }, [bothOutcome, baselineOnlyOutcome, refinedOnlyOutcome]);

  const hasBaselineBounds = boundRows.some((r) => r.baseline_lower !== null);
  const hasRefinedBounds = boundRows.some((r) => r.refined_lower !== null);

  const boundsColumns = useMemo<ColumnDef<ClassBoundRowDTO, unknown>[]>(() => {
    const cols: ColumnDef<ClassBoundRowDTO, unknown>[] = [
      {
        accessorKey: 'class_index',
        header: 'Class',
        cell: (info) => {
          const row = info.row.original;
          return (
            <span className="font-mono-tabular font-semibold">
              {row.class_index}
              {row.is_target && (
                <span className="ml-2 rounded border border-[#702B3A]/30 bg-[#702B3A]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#702B3A]">
                  Target
                </span>
              )}
            </span>
          );
        },
      },
    ];

    if (hasBaselineBounds) {
      cols.push(
        {
          accessorKey: 'baseline_lower',
          header: 'IBP Lower',
          cell: (info) => (
            <span className="font-mono-tabular">
              {formatOptionalNumber(info.getValue() as number | null, 5)}
            </span>
          ),
        },
        {
          accessorKey: 'baseline_upper',
          header: 'IBP Upper',
          cell: (info) => (
            <span className="font-mono-tabular">
              {formatOptionalNumber(info.getValue() as number | null, 5)}
            </span>
          ),
        },
        {
          accessorKey: 'baseline_width',
          header: 'IBP Width',
          cell: (info) => (
            <span className="font-mono-tabular">
              {formatOptionalNumber(info.getValue() as number | null, 5)}
            </span>
          ),
        },
      );
    }

    if (hasRefinedBounds) {
      cols.push(
        {
          accessorKey: 'refined_lower',
          header: 'LP Lower',
          cell: (info) => (
            <span className="font-mono-tabular font-semibold text-[#702B3A]">
              {formatOptionalNumber(info.getValue() as number | null, 5)}
            </span>
          ),
        },
        {
          accessorKey: 'refined_upper',
          header: 'LP Upper',
          cell: (info) => (
            <span className="font-mono-tabular font-semibold text-[#702B3A]">
              {formatOptionalNumber(info.getValue() as number | null, 5)}
            </span>
          ),
        },
        {
          accessorKey: 'refined_width',
          header: 'LP Width',
          cell: (info) => (
            <span className="font-mono-tabular">
              {formatOptionalNumber(info.getValue() as number | null, 5)}
            </span>
          ),
        },
      );
    }

    if (hasBaselineBounds && hasRefinedBounds) {
      cols.push({
        accessorKey: 'width_tightening_pct',
        header: 'Tightening (%)',
        cell: (info) => {
          const val = info.getValue() as number | null;
          return (
            <span className="font-mono-tabular font-semibold text-[#1E7A34]">
              {val === null || val === undefined ? '—' : `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`}
            </span>
          );
        },
      });
    }

    return cols;
  }, [hasBaselineBounds, hasRefinedBounds]);

  const controlsInvalid = Boolean(sampleValidationError || epsilonValidationError);

  return (
    <div>
      <PageHeader
        kicker="Sample-Level Verification Inspection"
        title="Individual Verification"
        description="Inspect an MNIST test sample, configure the L-infinity perturbation radius ε, and evaluate baseline Interval Bound Propagation alongside L4-only LP-refined logit bounds."
        breadcrumbs={[{ label: 'Workspace', to: '/' }, { label: 'Individual Verification' }]}
      />

      {/* 1. Sample & Epsilon Selection */}
      <section className="mb-8">
        <SectionHeader
          kicker="Step 1 · Query Configuration"
          title="Select MNIST Sample & Perturbation Radius"
        />

        <div className="grid gap-5 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardContent className="space-y-4 pt-5">
              <div>
                <label
                  htmlFor="sample-index-input"
                  className="block text-xs font-semibold uppercase tracking-[0.06em] text-[#51494A]"
                >
                  MNIST Test Sample Index (0 – {maxSampleIndex})
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Previous MNIST sample"
                    onClick={() => stepSampleIndex(-1)}
                    disabled={sampleIndex <= 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <input
                    id="sample-index-input"
                    type="number"
                    min={0}
                    max={maxSampleIndex}
                    step={1}
                    value={sampleInput}
                    onChange={(e) => commitSampleIndex(e.target.value)}
                    className="w-full rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-3 py-2 font-mono-tabular text-sm text-[#30282A]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Next MNIST sample"
                    onClick={() => stepSampleIndex(1)}
                    disabled={sampleIndex >= maxSampleIndex}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                {sampleValidationError && (
                  <p className="mt-1 text-xs text-[#B3261E]">{sampleValidationError}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="epsilon-slider"
                    className="text-xs font-semibold uppercase tracking-[0.06em] text-[#51494A]"
                  >
                    Perturbation Radius ε (L∞)
                  </label>
                  <input
                    aria-label="Epsilon numeric value"
                    type="number"
                    min={0}
                    step={0.005}
                    value={epsilonInput}
                    onChange={(e) => commitEpsilon(e.target.value)}
                    className="w-24 rounded-md border border-[#E5DCD3] bg-[#F7F3ED] px-2 py-1 text-right font-mono-tabular text-xs text-[#30282A]"
                  />
                </div>
                <input
                  id="epsilon-slider"
                  type="range"
                  min={0}
                  max={0.2}
                  step={0.005}
                  value={Math.min(0.2, Math.max(0, epsilon))}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setEpsilonInput(val.toFixed(3));
                    commitEpsilon(val.toFixed(3));
                  }}
                  className="mt-2 w-full accent-[#702B3A]"
                />
                <div className="flex justify-between font-mono-tabular text-[11px] text-[#827875]">
                  <span>0.000</span>
                  <span>0.050</span>
                  <span>0.100</span>
                  <span>0.150</span>
                  <span>0.200</span>
                </div>
                {epsilonValidationError && (
                  <p className="mt-1 text-xs text-[#B3261E]">{epsilonValidationError}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-7">
            <CardContent className="pt-5">
              {previewLoading ? (
                <LoadingState label="Loading MNIST digit preview…" />
              ) : previewError ? (
                <ErrorState title="Sample load error" message={previewError} />
              ) : preview ? (
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <MnistDigitCanvas matrix={preview.image} />
                    <span className="font-mono-tabular text-xs text-[#827875]">
                      MNIST Test Digit #{preview.sample_index}
                    </span>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-[0.1em] text-[#702B3A]">
                        Classification Summary
                      </span>
                      {preview.label === preview.predicted ? (
                        <StatusBadge status="CERTIFIED" className="hidden" />
                      ) : null}
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase text-[#827875]">
                          True Label
                        </p>
                        <p className="font-mono-tabular text-lg font-bold text-[#30282A]">
                          {preview.label}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase text-[#827875]">
                          Predicted
                        </p>
                        <p className="font-mono-tabular text-lg font-bold text-[#702B3A]">
                          {preview.predicted}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[#E5DCD3] bg-[#F7F3ED] px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase text-[#827875]">
                          Target Class
                        </p>
                        <p className="font-mono-tabular text-lg font-bold text-[#30282A]">
                          {preview.predicted}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-[#51494A]">
                      Perturbation domain:{' '}
                      <code className="rounded bg-[#F1EAE2] px-1.5 py-0.5 text-[#30282A]">
                        [{preview.pixel_min.toFixed(2)} − {epsilon},{' '}
                        {preview.pixel_max.toFixed(2)} + {epsilon}] ∩ [0, 1]⁷⁸⁴
                      </code>
                      . Verification proves class <strong>{preview.predicted}</strong> dominates
                      all competitors across the entire continuous neighborhood.
                    </p>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 2. Execution Controls */}
      <section className="mb-8">
        <SectionHeader
          kicker="Step 2 · Execution"
          title="Run Verification Methods"
          description="Requests are cached in memory per (sample_index, epsilon, mode). LP refinement uses the production L4-only default."
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={controlsInvalid || verifyingMode !== null}
            onClick={() => runVerification('baseline')}
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            {verifyingMode === 'baseline'
              ? 'Running Baseline IBP…'
              : 'Run Baseline IBP'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={controlsInvalid || verifyingMode !== null}
            onClick={() => runVerification('refined')}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {verifyingMode === 'refined'
              ? 'Solving L4 LP Relaxations…'
              : 'Run LP-Refined Verification (L4 Default)'}
          </Button>
          <Button
            type="button"
            disabled={controlsInvalid || verifyingMode !== null}
            onClick={() => runVerification('both')}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {verifyingMode === 'both'
              ? 'Running Both Methods…'
              : 'Run Both & Compare'}
          </Button>
        </div>

        {verifyingMode && (
          <div className="mt-4">
            <LoadingState
              label={
                verifyingMode === 'baseline'
                  ? 'Computing Interval Bound Propagation…'
                  : 'Solving Planet/triangle LP relaxations via SciPy HiGHS…'
              }
              description={`Sample #${sampleIndex} at ε = ${epsilon}`}
            />
          </div>
        )}

        {verifyError && (
          <div className="mt-4">
            <ErrorState title="Verification request failed" message={verifyError} />
          </div>
        )}
      </section>

      {/* 3. Verification Outcomes */}
      <section className="mb-8">
        <SectionHeader
          kicker="Step 3 · Verdicts & Margins"
          title="Verification Outcomes"
          description={
            activeOutcome
              ? `Showing results for Sample #${activeOutcome.sample_index} (true label ${activeOutcome.label}, target class ${activeOutcome.target_class}) at ε = ${activeOutcome.epsilon}.`
              : 'Execute a verification method above to inspect verdicts, margins, and runtime.'
          }
        />

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Baseline Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Baseline Interval Bound Propagation</CardTitle>
              <StatusBadge status={activeBaseline?.status ?? null} />
            </CardHeader>
            <CardContent>
              {!activeBaseline ? (
                <EmptyState
                  title="Baseline IBP Not Run"
                  description="Run Baseline IBP (or Run Both) for this sample and ε to inspect coarse interval bounds."
                />
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard
                      label="Margin"
                      value={formatOptionalNumber(activeBaseline.margin)}
                      sublabel="L_t − max(U_j)"
                    />
                    <MetricCard
                      label="Target Class"
                      value={activeOutcome?.target_class ?? preview?.predicted ?? '—'}
                      sublabel={`Label: ${activeOutcome?.label ?? preview?.label ?? '—'}`}
                      tone="muted"
                    />
                    <MetricCard
                      label="IBP Time"
                      value={formatSeconds(activeBaseline.time_seconds, 4)}
                      sublabel="Forward interval pass"
                      tone="muted"
                    />
                  </div>
                  {activeBaseline.status === 'ERROR' && activeBaseline.error && (
                    <ErrorState title="Baseline execution error" message={activeBaseline.error} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Refined Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>LP-Refined Verification (IBP + HiGHS)</CardTitle>
              <StatusBadge status={activeRefined?.status ?? null} />
            </CardHeader>
            <CardContent>
              {!activeRefined ? (
                <EmptyState
                  title="LP-Refined Verification Not Run"
                  description="Run LP-Refined Verification (or Run Both) to tighten output logits with L4-only LP optimization."
                />
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label="Refined Margin"
                      value={formatOptionalNumber(activeRefined.margin)}
                      sublabel="L_t − max(U_j)"
                    />
                    <MetricCard
                      label="LP Solve Time"
                      value={formatSeconds(activeRefined.lp_refinement_time_seconds, 3)}
                      sublabel="HiGHS stage"
                      tone="muted"
                    />
                    <MetricCard
                      label="Total Time"
                      value={formatSeconds(activeRefined.time_seconds, 3)}
                      sublabel="IBP + LP + check"
                      tone="muted"
                    />
                    <MetricCard
                      label="LP Targets"
                      value={`${activeRefined.refinement_accepted ?? 0} / ${activeRefined.refinement_targets ?? 0}`}
                      sublabel={`Rejected: ${activeRefined.refinement_rejected ?? 0}`}
                      tone="positive"
                    />
                  </div>
                  {activeRefined.refinement_status && (
                    <div className="flex items-center gap-2 text-xs text-[#51494A]">
                      <span>Refinement status:</span>
                      <StatusBadge status={activeRefined.refinement_status} />
                    </div>
                  )}
                  {activeRefined.status === 'ERROR' && activeRefined.error && (
                    <ErrorState title="LP refinement error" message={activeRefined.error} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-r-lg border-l-4 border-l-[#702B3A] bg-[#F1EAE2] px-4 py-3 text-xs leading-relaxed text-[#30282A]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#702B3A]" aria-hidden="true" />
          <p>
            <strong>Interpreting Bounds & Verdicts:</strong> For each digit class{' '}
            <code>j ∈ {'{0..9}'}</code>, the interval <code>[Lower_j, Upper_j]</code> provably
            encloses the logit range over the perturbation box. A sample is{' '}
            <strong>CERTIFIED</strong> iff the target class&apos;s lower bound strictly exceeds
            every competitor&apos;s upper bound (<code>Margin &gt; 0</code>). An{' '}
            <strong>INCONCLUSIVE</strong> verdict means bounds overlap under the convex relaxation
            — it is <em>not</em> an adversarial counterexample and does <em>not</em> prove unsafety.
          </p>
        </div>
      </section>

      {/* 4. Class-by-Class Output Logit Bounds Table */}
      <section>
        <SectionHeader
          kicker="Step 4 · Logit Enclosures"
          title="Class-by-Class Output Logit Bounds"
          description="Sortable bounds table for all ten digit classes. Run both Baseline IBP and LP-Refined to view interval tightening percentages."
        />
        {boundRows.length > 0 ? (
          <DataTable
            data={boundRows}
            columns={boundsColumns}
            caption="Class-by-class lower and upper logit bounds"
            initialSorting={[{ id: 'class_index', desc: false }]}
          />
        ) : (
          <EmptyState
            title="No Output Bounds Computed Yet"
            description="Run Baseline IBP, LP-Refined, or Both for the selected sample and ε."
          />
        )}
      </section>
    </div>
  );
}

/**
 * TypeScript interfaces mirroring MiniCert FastAPI backend schemas (backend/schemas/).
 */

export interface HealthResponse {
  status: 'ok' | 'unhealthy';
  model_loaded: boolean;
  network_loaded: boolean;
  dataset_loaded: boolean;
  dataset_size: number | null;
  experiments_dir_ready: boolean;
  active_jobs: number;
  legacy_imported_count: number;
  startup_error: string | null;
}

export interface SequenceLayerDTO {
  position: number;
  type: 'linear' | 'relu';
  input_features: number | null;
  output_features: number | null;
  activation: string | null;
}

export interface ModelArchitectureResponse {
  source_model: string;
  input_features: number;
  output_features: number;
  num_linear_layers: number;
  num_sequence_layers: number;
  total_trainable_parameters: number;
  layers: string[];
  sequence: SequenceLayerDTO[];
  checkpoint: string;
}

export interface DatasetInfoDTO {
  name: string;
  split: string;
  total_samples: number;
}

export interface EquivalenceWorstCaseDTO {
  sample_index: number;
  epsilon: number;
  max_lower_diff: number;
  worst_lower_class: number;
  max_upper_diff: number;
  worst_upper_class: number;
  margin_diff: number;
}

export interface EquivalenceMetricsBlockDTO {
  epsilon: number | null;
  total_pairs: number;
  completed_pairs: number;
  incomplete_pairs: number;
  max_lower_diff: number;
  max_upper_diff: number;
  max_margin_diff: number;
  verdict_mismatches: number;
  discrepancies_over_tolerance: number;
  mode_a_total_lp_solves: number;
  mode_b_total_lp_solves: number;
  mode_a_rejected_targets_total: number;
  mode_b_rejected_targets_total: number;
  mode_a_mean_runtime: number;
  mode_a_median_runtime: number;
  mode_b_mean_runtime: number;
  mode_b_median_runtime: number;
  mean_runtime_speedup: number;
  median_runtime_speedup: number;
  worst_case: EquivalenceWorstCaseDTO;
}

export interface EquivalenceSummaryDTO {
  experiment_id: string;
  experiment_name: string;
  experiment_type: string;
  timestamp: string;
  status: string;
  equivalent: boolean;
  config: {
    sample_count: number;
    epsilons: number[];
    seed: number;
    tolerance: number;
    [key: string]: unknown;
  };
  model: {
    checkpoint: string;
    source_model: string;
  };
  dataset: DatasetInfoDTO;
  sample_selection: {
    requested: number;
    selected: number;
    incorrect_excluded: number;
    scanned: number;
    seed: number;
  };
  overall: EquivalenceMetricsBlockDTO;
  by_epsilon: EquivalenceMetricsBlockDTO[];
  failing_pairs: unknown[];
}

export interface EquivalenceAuditDTO {
  available: boolean;
  error: string | null;
  summary: EquivalenceSummaryDTO | null;
  solves_ratio: number | null;
}

export interface ExperimentMetadataDTO {
  experiment_id: string;
  experiment_type: string;
  timestamp: string;
  sample_count: number;
  epsilons: number[];
  seed: number;
  status: string;
  experiment_name: string;
  folder_name: string;
  error_message: string | null;
}

export interface OverviewResponse {
  model: ModelArchitectureResponse;
  dataset: DatasetInfoDTO;
  equivalence_audit: EquivalenceAuditDTO;
  experiments_count: number;
  latest_completed_experiment: ExperimentMetadataDTO | null;
}

// ---------------------------------------------------------------------------
// Individual Verification (/api/samples/{idx}, /api/verification)
// ---------------------------------------------------------------------------

export type VerificationMode = 'baseline' | 'refined' | 'both';

export interface SamplePreviewResponse {
  sample_index: number;
  label: number;
  predicted: number;
  logits: number[];
  pixel_min: number;
  pixel_max: number;
  image: number[][];
}

export interface VerificationRequest {
  sample_index: number;
  epsilon: number;
  mode: VerificationMode;
}

export interface BaselineVerificationDTO {
  status: string | null;
  margin: number | null;
  time_seconds: number | null;
  lower: number[];
  upper: number[];
  error: string | null;
}

export interface RefinedVerificationDTO {
  status: string | null;
  margin: number | null;
  time_seconds: number | null;
  lp_refinement_time_seconds: number | null;
  refinement_status: string | null;
  refinement_targets: number | null;
  refinement_accepted: number | null;
  refinement_rejected: number | null;
  lower: number[];
  upper: number[];
  error: string | null;
}

export interface ClassBoundRowDTO {
  class_index: number;
  is_target: boolean;
  baseline_lower: number | null;
  baseline_upper: number | null;
  baseline_width: number | null;
  refined_lower: number | null;
  refined_upper: number | null;
  refined_width: number | null;
  width_tightening_pct: number | null;
}

export interface VerificationResponse {
  sample_index: number;
  epsilon: number;
  label: number;
  predicted: number;
  target_class: number;
  mode: VerificationMode;
  logits: number[];
  baseline: BaselineVerificationDTO | null;
  refined: RefinedVerificationDTO | null;
  per_class_bounds: ClassBoundRowDTO[];
}

// ---------------------------------------------------------------------------
// Experiments, Jobs, Results & History
// ---------------------------------------------------------------------------

export type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ExperimentCreateRequest {
  experiment_type: 'development' | 'configured';
  sample_count?: number;
  epsilons?: number[] | string;
  seed?: number;
  experiment_name?: string;
}

export interface ExperimentJobAcceptedResponse {
  experiment_id: string;
  status: JobStatus;
  experiment_type: string;
  sample_count: number;
  epsilons: number[];
  seed: number;
  total_pairs: number;
  estimated_lp_solves: number;
  created_at: string;
}

export interface ExperimentJobStatusResponse {
  experiment_id: string;
  status: JobStatus;
  stage: string;
  experiment_type: string;
  completed_pairs: number;
  total_pairs: number;
  progress_percent: number;
  current_epsilon: number | null;
  current_sample_index: number | null;
  elapsed_seconds: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  metadata: ExperimentMetadataDTO | null;
}

export interface CertificationMetricsDTO {
  epsilon: number;
  total_test_samples: number;
  evaluated_samples: number;
  incorrect_excluded: number;
  baseline_certified: number;
  refined_certified: number;
  baseline_rate: number | null;
  refined_rate: number | null;
  improvement_pp: number | null;
  baseline_inconclusive: number;
  refined_inconclusive: number;
  baseline_errors: number;
  refined_errors: number;
}

export interface BoundTighteningMetricsDTO {
  mean_baseline_width: number | null;
  mean_refined_width: number | null;
  mean_abs_width_reduction: number | null;
  mean_relative_width_reduction: number | null;
  zero_width_baseline_intervals: number;
  measured_samples: number;
}

export interface RuntimeMetricsDTO {
  mean_baseline_time: number | null;
  median_baseline_time: number | null;
  mean_lp_refinement_time: number | null;
  median_lp_refinement_time: number | null;
  mean_total_refined_time: number | null;
  median_total_refined_time: number | null;
  baseline_times_measured: number;
  lp_times_measured: number;
  refined_times_measured: number;
}

export interface EpsilonMetricsDTO {
  epsilon: number;
  certification: CertificationMetricsDTO;
  bounds: BoundTighteningMetricsDTO;
  runtime: RuntimeMetricsDTO;
}

export interface SampleRecordDTO {
  sample_index: number;
  label: number;
  predicted: number;
  target_class: number;
  epsilon: number;
  baseline_status: string;
  baseline_margin: number | null;
  baseline_time_seconds: number | null;
  refined_status: string;
  refined_margin: number | null;
  refined_time_seconds: number | null;
  lp_refinement_time_seconds: number | null;
  refinement_status: string | null;
  refinement_targets: number | null;
  refinement_accepted: number | null;
  refinement_rejected: number | null;
  baseline_width_mean: number | null;
  refined_width_mean: number | null;
  abs_width_reduction_mean: number | null;
  rel_width_reduction_mean: number | null;
  zero_width_baseline_intervals: number | null;
  error: string | null;
}

export interface CertificationRatePoint {
  epsilon: number;
  baseline_percent: number | null;
  refined_percent: number | null;
}

export interface WidthSeriesPoint {
  epsilon: number;
  baseline_width: number | null;
  refined_width: number | null;
}

export interface RuntimeSeriesPoint {
  epsilon: number;
  baseline_time: number | null;
  lp_refinement_time: number | null;
  refined_total_time: number | null;
}

export interface ImprovementSeriesPoint {
  epsilon: number;
  improvement_pp: number | null;
}

export interface ChartSeriesDTO {
  certification_rates: CertificationRatePoint[];
  interval_widths: WidthSeriesPoint[];
  runtime: RuntimeSeriesPoint[];
  improvement: ImprovementSeriesPoint[];
}

export interface ExperimentResultsResponse {
  metadata: ExperimentMetadataDTO;
  config: Record<string, unknown>;
  model: { checkpoint?: string; source_model?: string };
  dataset: { name?: string; split?: string; total_samples?: number };
  sample_selection: {
    requested?: number;
    selected?: number;
    incorrect_excluded?: number;
    scanned?: number;
    seed?: number;
  };
  metrics: EpsilonMetricsDTO[];
  charts: ChartSeriesDTO;
  records: SampleRecordDTO[];
}

export interface HistoryListResponse {
  experiments: ExperimentMetadataDTO[];
  total: number;
}

export interface HistoryRefreshResponse {
  imported_count: number;
  imported: ExperimentMetadataDTO[];
  experiments: ExperimentMetadataDTO[];
}

export interface HistoryDetailResponse {
  metadata: ExperimentMetadataDTO;
  loadable: boolean;
  config: Record<string, unknown> | null;
  model: { checkpoint?: string; source_model?: string } | null;
  dataset: { name?: string; split?: string; total_samples?: number } | null;
  sample_selection: {
    requested?: number;
    selected?: number;
    incorrect_excluded?: number;
    scanned?: number;
    seed?: number;
  } | null;
  metrics: EpsilonMetricsDTO[];
  charts: ChartSeriesDTO | null;
  records: SampleRecordDTO[];
}

// ---------------------------------------------------------------------------
// Multi-Experiment Comparison (/api/comparison)
// ---------------------------------------------------------------------------

export interface ComparisonRequest {
  experiment_ids: string[];
}

export interface ComparisonItemDTO {
  metadata: ExperimentMetadataDTO;
  display_label: string;
}

export interface ComparisonEpsilonTableDTO {
  epsilon: number;
  rows: Array<Record<string, string | number | null>>;
}

export interface ComparisonPerEpsilonMetrics {
  baseline_rate_pct: number | null;
  refined_rate_pct: number | null;
  improvement_pp: number | null;
  baseline_width: number | null;
  refined_width: number | null;
  abs_width_reduction: number | null;
  rel_width_reduction_pct: number | null;
  baseline_time: number | null;
  lp_time: number | null;
  refined_total_time: number | null;
}

export interface ComparisonExperimentSeries {
  id: string;
  label: string;
  type: string;
  sample_count: number;
  seed: number;
  per_epsilon: Record<string, ComparisonPerEpsilonMetrics | null>;
}

export interface ComparisonChartSeries {
  matching_epsilons: number[];
  experiments: ComparisonExperimentSeries[];
}

export interface ComparisonResponse {
  experiments: ComparisonItemDTO[];
  matching_epsilons: number[];
  all_epsilons: number[];
  differing_epsilons: Record<string, number[]>;
  sample_counts_differ: boolean;
  seeds_differ: boolean;
  identical_samples: boolean;
  notices: string[];
  tables: ComparisonEpsilonTableDTO[];
  chart_series: ComparisonChartSeries;
}

"""Pydantic schemas for experiment creation, background jobs, and results."""

from __future__ import annotations

import math
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator

from backend.schemas.overview import ExperimentMetadataDTO
from dashboard.components import parse_epsilon_input

JobStatus = Literal["QUEUED", "RUNNING", "COMPLETED", "FAILED"]


class ExperimentCreateRequest(BaseModel):
    """Configuration payload to enqueue a new evaluation experiment."""

    experiment_type: Literal["development", "configured"] = "configured"
    sample_count: Optional[int] = None
    epsilons: Optional[Union[list[float], str]] = None
    seed: Optional[int] = None
    experiment_name: str = ""

    @field_validator("sample_count", "seed", mode="before")
    @classmethod
    def _reject_bool_ints(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("integer parameter cannot be a boolean")
        return value

    @field_validator("epsilons", mode="before")
    @classmethod
    def _validate_epsilons(cls, value: object) -> Optional[list[float]]:
        if value is None:
            return None
        if isinstance(value, str):
            return list(parse_epsilon_input(value))
        if not isinstance(value, (list, tuple)) or not value:
            raise ValueError("epsilons must be a non-empty list of finite nonnegative floats")
        validated: list[float] = []
        for idx, item in enumerate(value):
            if isinstance(item, bool):
                raise ValueError(f"epsilons[{idx}] cannot be a boolean")
            try:
                num = float(item)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"epsilons[{idx}] must be a number: {exc}") from exc
            if not math.isfinite(num) or num < 0.0:
                raise ValueError(
                    f"epsilons[{idx}] must be finite and nonnegative, got {num}"
                )
            validated.append(num)
        return validated


class ExperimentJobAcceptedResponse(BaseModel):
    """Immediate 202 response returned when an experiment job is queued."""

    experiment_id: str
    status: JobStatus
    experiment_type: str
    sample_count: int
    epsilons: list[float]
    seed: int
    total_pairs: int
    estimated_lp_solves: int
    created_at: str


class ExperimentJobStatusResponse(BaseModel):
    """Live or terminal status snapshot of an experiment execution job."""

    experiment_id: str
    status: JobStatus
    stage: str
    experiment_type: str
    completed_pairs: int
    total_pairs: int
    progress_percent: float
    current_epsilon: Optional[float] = None
    current_sample_index: Optional[int] = None
    elapsed_seconds: float
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    error: Optional[str] = None
    metadata: Optional[ExperimentMetadataDTO] = None


class CertificationMetricsDTO(BaseModel):
    """Mirror of evaluation.metrics.CertificationMetrics."""

    epsilon: float
    total_test_samples: int
    evaluated_samples: int
    incorrect_excluded: int
    baseline_certified: int
    refined_certified: int
    baseline_rate: Optional[float]
    refined_rate: Optional[float]
    improvement_pp: Optional[float]
    baseline_inconclusive: int
    refined_inconclusive: int
    baseline_errors: int
    refined_errors: int


class BoundTighteningMetricsDTO(BaseModel):
    """Mirror of evaluation.metrics.BoundTighteningMetrics."""

    mean_baseline_width: Optional[float]
    mean_refined_width: Optional[float]
    mean_abs_width_reduction: Optional[float]
    mean_relative_width_reduction: Optional[float]
    zero_width_baseline_intervals: int
    measured_samples: int


class RuntimeMetricsDTO(BaseModel):
    """Mirror of evaluation.metrics.RuntimeMetrics."""

    mean_baseline_time: Optional[float]
    median_baseline_time: Optional[float]
    mean_lp_refinement_time: Optional[float]
    median_lp_refinement_time: Optional[float]
    mean_total_refined_time: Optional[float]
    median_total_refined_time: Optional[float]
    baseline_times_measured: int
    lp_times_measured: int
    refined_times_measured: int


class EpsilonMetricsDTO(BaseModel):
    """Mirror of evaluation.metrics.EpsilonMetrics."""

    epsilon: float
    certification: CertificationMetricsDTO
    bounds: BoundTighteningMetricsDTO
    runtime: RuntimeMetricsDTO


class SampleRecordDTO(BaseModel):
    """Mirror of evaluation.metrics.SampleRecord preserving None values."""

    sample_index: int
    label: int
    predicted: int
    target_class: int
    epsilon: float
    baseline_status: str
    baseline_margin: Optional[float]
    baseline_time_seconds: Optional[float]
    refined_status: str
    refined_margin: Optional[float]
    refined_time_seconds: Optional[float]
    lp_refinement_time_seconds: Optional[float]
    refinement_status: Optional[str]
    refinement_targets: Optional[int]
    refinement_accepted: Optional[int]
    refinement_rejected: Optional[int]
    baseline_width_mean: Optional[float]
    refined_width_mean: Optional[float]
    abs_width_reduction_mean: Optional[float]
    rel_width_reduction_mean: Optional[float]
    zero_width_baseline_intervals: Optional[int]
    error: Optional[str]


class ChartSeriesDTO(BaseModel):
    """Chart-ready series produced by dashboard.components."""

    certification_rates: list[dict[str, Any]]
    interval_widths: list[dict[str, Any]]
    runtime: list[dict[str, Any]]
    improvement: list[dict[str, Any]]


class ExperimentResultsResponse(BaseModel):
    """Full read-only payload for a completed/failed experiment."""

    metadata: ExperimentMetadataDTO
    config: dict[str, Any]
    model: dict[str, Any]
    dataset: dict[str, Any]
    sample_selection: dict[str, Any]
    metrics: list[EpsilonMetricsDTO]
    charts: ChartSeriesDTO
    records: list[SampleRecordDTO]

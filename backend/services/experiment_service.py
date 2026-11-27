"""Service helpers for experiment configuration, loading results, and chart series."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any, Optional

from backend.config import BackendConfig
from backend.jobs.manager import metadata_to_dto
from backend.schemas.experiments import (
    BoundTighteningMetricsDTO,
    CertificationMetricsDTO,
    ChartSeriesDTO,
    EpsilonMetricsDTO,
    ExperimentCreateRequest,
    ExperimentResultsResponse,
    RuntimeMetricsDTO,
    SampleRecordDTO,
)
from backend.schemas.overview import ExperimentMetadataDTO
from dashboard.components import (
    certification_rate_series,
    improvement_series,
    runtime_series,
    width_series,
)
from dashboard.storage import (
    ExperimentMetadata,
    list_experiments,
    load_experiment_data,
    load_experiment_result,
)
from evaluation.experiment import ExperimentConfig, ExperimentResult


class ExperimentNotLoadableError(ValueError):
    """Raised when an experiment exists on disk but is Incomplete or Corrupted."""


def build_experiment_config(
    req: ExperimentCreateRequest,
    config: BackendConfig,
    dataset_size: int,
) -> ExperimentConfig:
    """Validate and construct an ExperimentConfig from an API creation request."""
    if req.experiment_type == "development":
        sample_count = 5 if req.sample_count is None else req.sample_count
        epsilons = (0.03,) if req.epsilons is None else tuple(req.epsilons)
        seed = 42 if req.seed is None else req.seed
    else:
        sample_count = 20 if req.sample_count is None else req.sample_count
        epsilons = (
            (0.01, 0.03, 0.05, 0.1) if req.epsilons is None else tuple(req.epsilons)
        )
        seed = 42 if req.seed is None else req.seed

    if sample_count < 1 or sample_count > dataset_size:
        raise ValueError(
            f"sample_count must be between 1 and {dataset_size}, got {sample_count}"
        )
    if seed < 0 or seed > 2**31 - 1:
        raise ValueError(f"seed must be between 0 and {2**31 - 1}, got {seed}")

    return ExperimentConfig(
        sample_count=sample_count,
        epsilons=epsilons,
        seed=seed,
        data_dir=config.data_dir,
        checkpoint=config.checkpoint_path,
        output_dir=config.experiments_dir,
        experiment_name=req.experiment_name,
    )


def find_experiment_metadata(
    experiment_id: str,
    experiments_dir: Path,
) -> Optional[ExperimentMetadata]:
    """Locate ExperimentMetadata by exact experiment_id or folder name."""
    for meta in list_experiments(base_dir=experiments_dir):
        if meta.experiment_id == experiment_id or meta.folder_name == experiment_id:
            return meta
    return None


def _build_charts_dto(result: ExperimentResult) -> ChartSeriesDTO:
    return ChartSeriesDTO(
        certification_rates=certification_rate_series(result.metrics),
        interval_widths=width_series(result.metrics),
        runtime=runtime_series(result.metrics),
        improvement=improvement_series(result.metrics),
    )


def _metrics_to_dtos(result: ExperimentResult) -> list[EpsilonMetricsDTO]:
    return [
        EpsilonMetricsDTO(
            epsilon=entry.epsilon,
            certification=CertificationMetricsDTO(**asdict(entry.certification)),
            bounds=BoundTighteningMetricsDTO(**asdict(entry.bounds)),
            runtime=RuntimeMetricsDTO(**asdict(entry.runtime)),
        )
        for entry in result.metrics
    ]


def _records_to_dtos(result: ExperimentResult) -> list[SampleRecordDTO]:
    return [SampleRecordDTO(**asdict(rec)) for rec in result.records]


def load_experiment_payload(
    experiment_id: str,
    experiments_dir: Path,
) -> tuple[
    ExperimentMetadataDTO,
    dict[str, Any],
    dict[str, Any],
    dict[str, Any],
    dict[str, Any],
    list[EpsilonMetricsDTO],
    ChartSeriesDTO,
    list[SampleRecordDTO],
]:
    """Read-only reconstruction of stored experiment metrics, charts, and records."""
    meta = find_experiment_metadata(experiment_id, experiments_dir)
    if meta is None:
        raise FileNotFoundError(f"Experiment '{experiment_id}' not found")
    if meta.status not in ("Completed", "Failed"):
        detail = meta.error_message or f"status is {meta.status}"
        raise ExperimentNotLoadableError(
            f"Experiment '{experiment_id}' is {meta.status} and cannot be loaded ({detail})"
        )

    config_dict, summary_dict, _ = load_experiment_data(meta.path)
    result = load_experiment_result(meta.path)

    return (
        metadata_to_dto(meta),
        config_dict,
        summary_dict.get("model", {}),
        summary_dict.get("dataset", {}),
        summary_dict.get("sample_selection", {}),
        _metrics_to_dtos(result),
        _build_charts_dto(result),
        _records_to_dtos(result),
    )


def get_experiment_results(
    experiment_id: str,
    experiments_dir: Path,
) -> ExperimentResultsResponse:
    """Return full read-only results payload for a stored experiment."""
    meta_dto, config_dict, model, dataset, selection, metrics, charts, records = (
        load_experiment_payload(experiment_id, experiments_dir)
    )
    return ExperimentResultsResponse(
        metadata=meta_dto,
        config=config_dict,
        model=model,
        dataset=dataset,
        sample_selection=selection,
        metrics=metrics,
        charts=charts,
        records=records,
    )

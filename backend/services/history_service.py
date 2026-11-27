"""Service helpers for persistent experiment history and legacy imports."""

from __future__ import annotations

from pathlib import Path

from backend.jobs.manager import metadata_to_dto
from backend.schemas.history import (
    HistoryDetailResponse,
    HistoryListResponse,
    HistoryRefreshResponse,
)
from backend.services.experiment_service import (
    ExperimentNotLoadableError,
    find_experiment_metadata,
    load_experiment_payload,
)
from dashboard.storage import import_legacy_experiments, list_experiments


def list_history(experiments_dir: Path) -> HistoryListResponse:
    """List all persisted experiments sorted newest-first."""
    metas = list_experiments(base_dir=experiments_dir)
    return HistoryListResponse(
        experiments=[metadata_to_dto(m) for m in metas],
        total=len(metas),
    )


def refresh_history(results_dir: Path, experiments_dir: Path) -> HistoryRefreshResponse:
    """Run idempotent legacy import and return updated history list."""
    imported = import_legacy_experiments(
        source_dir=results_dir,
        target_base_dir=experiments_dir,
    )
    metas = list_experiments(base_dir=experiments_dir)
    return HistoryRefreshResponse(
        imported_count=len(imported),
        imported=[metadata_to_dto(m) for m in imported],
        experiments=[metadata_to_dto(m) for m in metas],
    )


def get_history_detail(
    experiment_id: str,
    experiments_dir: Path,
) -> HistoryDetailResponse:
    """Inspect a stored experiment, surfacing Incomplete/Corrupted metadata safely."""
    meta = find_experiment_metadata(experiment_id, experiments_dir)
    if meta is None:
        raise FileNotFoundError(f"Experiment '{experiment_id}' not found")

    if meta.status not in ("Completed", "Failed"):
        return HistoryDetailResponse(
            metadata=metadata_to_dto(meta),
            loadable=False,
        )

    try:
        meta_dto, config_dict, model, dataset, selection, metrics, charts, records = (
            load_experiment_payload(experiment_id, experiments_dir)
        )
    except ExperimentNotLoadableError:
        return HistoryDetailResponse(
            metadata=metadata_to_dto(meta),
            loadable=False,
        )

    return HistoryDetailResponse(
        metadata=meta_dto,
        loadable=True,
        config=config_dict,
        model=model,
        dataset=dataset,
        sample_selection=selection,
        metrics=metrics,
        charts=charts,
        records=records,
    )

"""Read-only CSV and JSON export download endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from backend.dependencies import AppResources, require_ready_resources
from backend.services.export_service import resolve_export_file

router = APIRouter(prefix="/api/exports", tags=["exports"])


@router.get("/{experiment_id}/csv")
def export_samples_csv(
    experiment_id: str,
    resources: AppResources = Depends(require_ready_resources),
) -> FileResponse:
    """Download an experiment's persisted samples.csv without mutating disk."""
    try:
        path = resolve_export_file(
            experiment_id=experiment_id,
            filename="samples.csv",
            experiments_dir=resources.config.experiments_dir,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return FileResponse(
        path=path,
        media_type="text/csv",
        filename=f"{experiment_id}_samples.csv",
    )


@router.get("/{experiment_id}/json")
def export_summary_json(
    experiment_id: str,
    resources: AppResources = Depends(require_ready_resources),
) -> FileResponse:
    """Download an experiment's persisted summary.json without mutating disk."""
    try:
        path = resolve_export_file(
            experiment_id=experiment_id,
            filename="summary.json",
            experiments_dir=resources.config.experiments_dir,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    return FileResponse(
        path=path,
        media_type="application/json",
        filename=f"{experiment_id}_summary.json",
    )

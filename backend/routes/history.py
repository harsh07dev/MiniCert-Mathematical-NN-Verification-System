"""Experiment history listing, legacy refresh, and detail inspection endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from backend.dependencies import AppResources, require_ready_resources
from backend.schemas.history import (
    HistoryDetailResponse,
    HistoryListResponse,
    HistoryRefreshResponse,
)
from backend.services.history_service import (
    get_history_detail,
    list_history,
    refresh_history,
)

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=HistoryListResponse)
def get_history(
    resources: AppResources = Depends(require_ready_resources),
) -> HistoryListResponse:
    """List all persisted experiments sorted newest-first."""
    return list_history(resources.config.experiments_dir)


@router.post("/refresh", response_model=HistoryRefreshResponse)
def post_refresh_history(
    resources: AppResources = Depends(require_ready_resources),
) -> HistoryRefreshResponse:
    """Discover and import newly completed legacy experiments idempotently."""
    return refresh_history(
        results_dir=resources.config.results_dir,
        experiments_dir=resources.config.experiments_dir,
    )


@router.get("/{experiment_id}", response_model=HistoryDetailResponse)
def get_history_item(
    experiment_id: str,
    resources: AppResources = Depends(require_ready_resources),
) -> HistoryDetailResponse:
    """Inspect a stored experiment without recomputing verification queries."""
    try:
        return get_history_detail(experiment_id, resources.config.experiments_dir)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

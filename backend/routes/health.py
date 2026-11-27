"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse

from backend.dependencies import AppResources, get_resources
from backend.schemas.common import HealthResponse

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def get_health(resources: AppResources = Depends(get_resources)) -> JSONResponse | HealthResponse:
    """Return startup resource readiness and active job count."""
    dataset_size = len(resources.dataset) if resources.dataset is not None else None
    active_jobs = (
        resources.job_manager.active_count() if resources.job_manager is not None else 0
    )
    payload = HealthResponse(
        status="ok" if resources.ready else "unhealthy",
        model_loaded=resources.pytorch_model is not None,
        network_loaded=resources.network is not None,
        dataset_loaded=resources.dataset is not None,
        dataset_size=dataset_size,
        experiments_dir_ready=resources.experiments_dir_ready,
        active_jobs=active_jobs,
        legacy_imported_count=resources.legacy_imported_count,
        startup_error=resources.startup_error,
    )
    if not resources.ready:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=payload.model_dump(),
        )
    return payload

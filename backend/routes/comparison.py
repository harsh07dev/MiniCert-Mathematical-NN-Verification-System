"""Multi-experiment comparison endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from backend.dependencies import AppResources, require_ready_resources
from backend.schemas.comparison import ComparisonRequest, ComparisonResponse
from backend.services.comparison_service import compare_experiments

router = APIRouter(prefix="/api", tags=["comparison"])


@router.post("/comparison", response_model=ComparisonResponse)
def post_comparison(
    body: ComparisonRequest,
    resources: AppResources = Depends(require_ready_resources),
) -> ComparisonResponse:
    """Compare >=2 Completed experiments across matching perturbation radii."""
    try:
        return compare_experiments(
            experiment_ids=body.experiment_ids,
            experiments_dir=resources.config.experiments_dir,
        )
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

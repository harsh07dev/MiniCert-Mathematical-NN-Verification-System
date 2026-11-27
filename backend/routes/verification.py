"""Individual sample preview and robustness verification endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from backend.dependencies import AppResources, require_ready_resources
from backend.schemas.verification import (
    SamplePreviewResponse,
    VerificationRequest,
    VerificationResponse,
)
from backend.services.verification_service import get_sample_preview, verify_individual

router = APIRouter(prefix="/api", tags=["verification"])


@router.get("/samples/{sample_index}", response_model=SamplePreviewResponse)
def get_sample(
    sample_index: int,
    resources: AppResources = Depends(require_ready_resources),
) -> SamplePreviewResponse:
    """Retrieve one MNIST test sample image, label, and nominal prediction."""
    assert resources.network is not None
    try:
        return get_sample_preview(resources.network, resources.dataset, sample_index)
    except IndexError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.post("/verification", response_model=VerificationResponse)
def run_verification(
    body: VerificationRequest,
    resources: AppResources = Depends(require_ready_resources),
) -> VerificationResponse:
    """Run baseline IBP and/or L4-only LP-refined verification for one sample."""
    assert resources.network is not None
    try:
        return verify_individual(
            network=resources.network,
            dataset=resources.dataset,
            sample_index=body.sample_index,
            epsilon=body.epsilon,
            mode=body.mode,
        )
    except IndexError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

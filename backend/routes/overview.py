"""Overview and dynamic model architecture endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.dependencies import AppResources, require_ready_resources
from backend.schemas.overview import ModelArchitectureResponse, OverviewResponse
from backend.services.overview_service import build_model_architecture, build_overview

router = APIRouter(prefix="/api", tags=["overview"])


@router.get("/overview", response_model=OverviewResponse)
def get_overview(
    resources: AppResources = Depends(require_ready_resources),
) -> OverviewResponse:
    """Return dynamic model metadata, dataset info, and equivalence audit summary."""
    assert resources.network is not None
    return build_overview(
        pytorch_model=resources.pytorch_model,
        network=resources.network,
        dataset=resources.dataset,
        checkpoint_path=resources.config.checkpoint_path,
        results_dir=resources.config.results_dir,
        experiments_dir=resources.config.experiments_dir,
    )


@router.get("/model/architecture", response_model=ModelArchitectureResponse)
def get_model_architecture(
    resources: AppResources = Depends(require_ready_resources),
) -> ModelArchitectureResponse:
    """Return the dynamically inspected MiniCertNet layer architecture."""
    assert resources.network is not None
    return build_model_architecture(
        pytorch_model=resources.pytorch_model,
        network=resources.network,
        checkpoint_path=resources.config.checkpoint_path,
    )

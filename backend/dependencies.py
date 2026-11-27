"""Shared application resources and FastAPI dependency providers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Optional

from fastapi import HTTPException, Request, status

from backend.config import BackendConfig
from models.model_loader import MathematicalNetwork

if TYPE_CHECKING:
    from backend.jobs.manager import ExperimentJobManager


@dataclass
class AppResources:
    """Cached application-wide resources initialized during FastAPI lifespan."""

    config: BackendConfig
    pytorch_model: Optional[Any] = None
    network: Optional[MathematicalNetwork] = None
    dataset: Optional[Any] = None
    job_manager: Optional[ExperimentJobManager] = None
    experiments_dir_ready: bool = False
    legacy_imported_count: int = 0
    startup_error: Optional[str] = None

    @property
    def ready(self) -> bool:
        """Return True when all required verification resources loaded cleanly."""
        return (
            self.startup_error is None
            and self.pytorch_model is not None
            and self.network is not None
            and self.dataset is not None
            and self.job_manager is not None
            and self.experiments_dir_ready
        )


def get_resources(request: Request) -> AppResources:
    """Retrieve the AppResources instance attached to FastAPI app state."""
    resources: Optional[AppResources] = getattr(request.app.state, "resources", None)
    if resources is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Backend resources have not been initialized.",
        )
    return resources


def require_ready_resources(request: Request) -> AppResources:
    """Ensure startup completed cleanly before serving verification/evaluation requests."""
    resources = get_resources(request)
    if not resources.ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=resources.startup_error or "Backend resources are not ready.",
        )
    return resources

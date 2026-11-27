"""Common health and shared response schemas."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Application startup and runtime readiness snapshot."""

    status: Literal["ok", "unhealthy"]
    model_loaded: bool
    network_loaded: bool
    dataset_loaded: bool
    dataset_size: Optional[int]
    experiments_dir_ready: bool
    active_jobs: int
    legacy_imported_count: int
    startup_error: Optional[str] = None

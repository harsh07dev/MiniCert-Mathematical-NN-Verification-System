"""Pydantic schemas for experiment history listing, refresh, and inspection."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from backend.schemas.experiments import (
    ChartSeriesDTO,
    EpsilonMetricsDTO,
    SampleRecordDTO,
)
from backend.schemas.overview import ExperimentMetadataDTO


class HistoryListResponse(BaseModel):
    """List of all discovered experiment folders sorted newest-first."""

    experiments: list[ExperimentMetadataDTO]
    total: int


class HistoryRefreshResponse(BaseModel):
    """Outcome of running idempotent legacy experiment discovery."""

    imported_count: int
    imported: list[ExperimentMetadataDTO]
    experiments: list[ExperimentMetadataDTO]


class HistoryDetailResponse(BaseModel):
    """Stored experiment inspection payload (handles Incomplete/Corrupted safely)."""

    metadata: ExperimentMetadataDTO
    loadable: bool
    config: Optional[dict[str, Any]] = None
    model: Optional[dict[str, Any]] = None
    dataset: Optional[dict[str, Any]] = None
    sample_selection: Optional[dict[str, Any]] = None
    metrics: list[EpsilonMetricsDTO] = Field(default_factory=list)
    charts: Optional[ChartSeriesDTO] = None
    records: list[SampleRecordDTO] = Field(default_factory=list)

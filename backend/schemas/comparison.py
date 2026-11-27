"""Pydantic schemas for multi-experiment comparison."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

from backend.schemas.overview import ExperimentMetadataDTO


class ComparisonRequest(BaseModel):
    """Request to compare at least two Completed experiments."""

    experiment_ids: list[str] = Field(min_length=2)

    @field_validator("experiment_ids")
    @classmethod
    def _validate_unique_ids(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        if len(cleaned) < 2:
            raise ValueError("Comparison requires at least two experiment IDs")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("Comparison experiment_ids must be distinct")
        return cleaned


class ComparisonItemDTO(BaseModel):
    """Metadata and display label of one compared experiment."""

    metadata: ExperimentMetadataDTO
    display_label: str


class ComparisonEpsilonTableDTO(BaseModel):
    """10-metric side-by-side table for one matching epsilon."""

    epsilon: float
    rows: list[dict[str, Any]]


class ComparisonResponse(BaseModel):
    """Complete multi-experiment comparability analysis, tables, and plot series."""

    experiments: list[ComparisonItemDTO]
    matching_epsilons: list[float]
    all_epsilons: list[float]
    differing_epsilons: dict[str, list[float]]
    sample_counts_differ: bool
    seeds_differ: bool
    identical_samples: bool
    notices: list[str]
    tables: list[ComparisonEpsilonTableDTO]
    chart_series: dict[str, Any]

"""Pydantic schemas for single-sample prediction and individual verification."""

from __future__ import annotations

import math
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class SamplePreviewResponse(BaseModel):
    """MNIST test sample image, ground-truth label, and nominal prediction."""

    sample_index: int
    label: int
    predicted: int
    logits: list[float]
    pixel_min: float
    pixel_max: float
    image: list[list[float]]


class VerificationRequest(BaseModel):
    """Request payload for individual baseline and/or LP-refined verification."""

    sample_index: int = Field(ge=0)
    epsilon: float
    mode: Literal["baseline", "refined", "both"] = "both"

    @field_validator("sample_index", mode="before")
    @classmethod
    def _reject_bool_sample_index(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("sample_index must be an integer, not a boolean")
        return value

    @field_validator("epsilon", mode="before")
    @classmethod
    def _validate_epsilon(cls, value: object) -> float:
        if isinstance(value, bool):
            raise ValueError("epsilon must be a real scalar, not a boolean")
        try:
            radius = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError) as exc:
            raise ValueError(f"epsilon must be a finite number: {exc}") from exc
        if not math.isfinite(radius) or radius < 0.0:
            raise ValueError(f"epsilon must be finite and nonnegative, got {radius}")
        return radius


class BaselineVerificationDTO(BaseModel):
    """Baseline IBP outcome fields derived from IndividualOutcome."""

    status: Optional[str] = None
    margin: Optional[float] = None
    time_seconds: Optional[float] = None
    lower: list[float] = Field(default_factory=list)
    upper: list[float] = Field(default_factory=list)
    error: Optional[str] = None


class RefinedVerificationDTO(BaseModel):
    """LP-refined (IBP + HiGHS, L4-only default) outcome fields."""

    status: Optional[str] = None
    margin: Optional[float] = None
    time_seconds: Optional[float] = None
    lp_refinement_time_seconds: Optional[float] = None
    refinement_status: Optional[str] = None
    refinement_targets: Optional[int] = None
    refinement_accepted: Optional[int] = None
    refinement_rejected: Optional[int] = None
    lower: list[float] = Field(default_factory=list)
    upper: list[float] = Field(default_factory=list)
    error: Optional[str] = None


class ClassBoundRowDTO(BaseModel):
    """Class-by-class logit interval row matching render_bounds_table."""

    class_index: int
    is_target: bool
    baseline_lower: Optional[float] = None
    baseline_upper: Optional[float] = None
    baseline_width: Optional[float] = None
    refined_lower: Optional[float] = None
    refined_upper: Optional[float] = None
    refined_width: Optional[float] = None
    width_tightening_pct: Optional[float] = None


class VerificationResponse(BaseModel):
    """Full individual verification response preserving CERTIFIED / INCONCLUSIVE / ERROR semantics."""

    sample_index: int
    epsilon: float
    label: int
    predicted: int
    target_class: int
    mode: Literal["baseline", "refined", "both"]
    logits: list[float]
    baseline: Optional[BaselineVerificationDTO] = None
    refined: Optional[RefinedVerificationDTO] = None
    per_class_bounds: list[ClassBoundRowDTO] = Field(default_factory=list)

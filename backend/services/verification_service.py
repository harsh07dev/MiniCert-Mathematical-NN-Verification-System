"""Service helpers for single-sample prediction and individual verification."""

from __future__ import annotations

from typing import Any, Literal, Optional

import numpy as np

from backend.schemas.verification import (
    BaselineVerificationDTO,
    ClassBoundRowDTO,
    RefinedVerificationDTO,
    SamplePreviewResponse,
    VerificationResponse,
)
from dashboard.services import (
    IndividualOutcome,
    predict_image,
    run_baseline_verification,
    run_refined_verification,
)
from evaluation.dataset import InputSample, flatten_image
from models.model_loader import MathematicalNetwork


def _load_sample(
    network: MathematicalNetwork,
    dataset: Any,
    sample_index: int,
) -> tuple[InputSample, np.ndarray, list[float]]:
    if sample_index < 0 or sample_index >= len(dataset):
        raise IndexError(
            f"sample_index {sample_index} is out of range [0, {len(dataset) - 1}]"
        )
    image_tensor, raw_label = dataset[sample_index]
    label = int(raw_label)
    vector = flatten_image(image_tensor)
    logits, predicted = predict_image(network, vector)
    sample = InputSample(index=sample_index, image=vector, label=label, predicted=predicted)
    return sample, vector, [float(v) for v in logits]


def get_sample_preview(
    network: MathematicalNetwork,
    dataset: Any,
    sample_index: int,
) -> SamplePreviewResponse:
    """Return image matrix, ground-truth label, and nominal prediction for one sample."""
    sample, vector, logits = _load_sample(network, dataset, sample_index)
    side = int(round(vector.size ** 0.5))
    if side * side == vector.size:
        matrix = vector.reshape(side, side).tolist()
    else:
        matrix = [vector.tolist()]
    return SamplePreviewResponse(
        sample_index=sample.index,
        label=sample.label,
        predicted=sample.predicted,
        logits=logits,
        pixel_min=float(np.min(vector)),
        pixel_max=float(np.max(vector)),
        image=matrix,
    )


def _build_per_class_rows(
    *,
    num_classes: int,
    target_class: int,
    baseline_lower: list[float],
    baseline_upper: list[float],
    refined_lower: list[float],
    refined_upper: list[float],
) -> list[ClassBoundRowDTO]:
    has_base = len(baseline_lower) == num_classes and len(baseline_upper) == num_classes
    has_ref = len(refined_lower) == num_classes and len(refined_upper) == num_classes
    rows: list[ClassBoundRowDTO] = []
    for idx in range(num_classes):
        b_lo = baseline_lower[idx] if has_base else None
        b_hi = baseline_upper[idx] if has_base else None
        b_w = (b_hi - b_lo) if (b_lo is not None and b_hi is not None) else None

        r_lo = refined_lower[idx] if has_ref else None
        r_hi = refined_upper[idx] if has_ref else None
        r_w = (r_hi - r_lo) if (r_lo is not None and r_hi is not None) else None

        tightening: Optional[float] = None
        if b_w is not None and r_w is not None:
            tightening = ((b_w - r_w) / b_w * 100.0) if b_w > 0.0 else 0.0

        rows.append(
            ClassBoundRowDTO(
                class_index=idx,
                is_target=(idx == target_class),
                baseline_lower=b_lo,
                baseline_upper=b_hi,
                baseline_width=b_w,
                refined_lower=r_lo,
                refined_upper=r_hi,
                refined_width=r_w,
                width_tightening_pct=tightening,
            )
        )
    return rows


def verify_individual(
    network: MathematicalNetwork,
    dataset: Any,
    sample_index: int,
    epsilon: float,
    mode: Literal["baseline", "refined", "both"],
) -> VerificationResponse:
    """Run baseline IBP and/or L4-only LP-refined verification using dashboard.services."""
    sample, _, logits = _load_sample(network, dataset, sample_index)

    base_outcome: Optional[IndividualOutcome] = None
    ref_outcome: Optional[IndividualOutcome] = None

    if mode in ("baseline", "both"):
        base_outcome = run_baseline_verification(network, sample, epsilon)
    if mode in ("refined", "both"):
        ref_outcome = run_refined_verification(network, sample, epsilon)

    baseline_dto: Optional[BaselineVerificationDTO] = None
    if base_outcome is not None:
        baseline_dto = BaselineVerificationDTO(
            status=base_outcome.baseline_status,
            margin=base_outcome.baseline_margin,
            time_seconds=base_outcome.baseline_time_seconds,
            lower=[float(v) for v in base_outcome.baseline_lower],
            upper=[float(v) for v in base_outcome.baseline_upper],
            error=base_outcome.error,
        )
    elif ref_outcome is not None:
        baseline_dto = BaselineVerificationDTO(
            status=ref_outcome.baseline_status,
            margin=ref_outcome.baseline_margin,
            time_seconds=None,
            lower=[],
            upper=[],
            error=ref_outcome.error,
        )

    refined_dto: Optional[RefinedVerificationDTO] = None
    if ref_outcome is not None:
        refined_dto = RefinedVerificationDTO(
            status=ref_outcome.refined_status,
            margin=ref_outcome.refined_margin,
            time_seconds=ref_outcome.refined_time_seconds,
            lp_refinement_time_seconds=ref_outcome.lp_refinement_time_seconds,
            refinement_status=ref_outcome.refinement_status,
            refinement_targets=ref_outcome.refinement_targets,
            refinement_accepted=ref_outcome.refinement_accepted,
            refinement_rejected=ref_outcome.refinement_rejected,
            lower=[float(v) for v in ref_outcome.refined_lower],
            upper=[float(v) for v in ref_outcome.refined_upper],
            error=ref_outcome.error,
        )

    rows = _build_per_class_rows(
        num_classes=network.output_features,
        target_class=sample.predicted,
        baseline_lower=baseline_dto.lower if baseline_dto else [],
        baseline_upper=baseline_dto.upper if baseline_dto else [],
        refined_lower=refined_dto.lower if refined_dto else [],
        refined_upper=refined_dto.upper if refined_dto else [],
    )

    return VerificationResponse(
        sample_index=sample.index,
        epsilon=float(epsilon),
        label=sample.label,
        predicted=sample.predicted,
        target_class=sample.predicted,
        mode=mode,
        logits=logits,
        baseline=baseline_dto,
        refined=refined_dto,
        per_class_bounds=rows,
    )

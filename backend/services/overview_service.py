"""Service helpers for model architecture and research overview metadata."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.jobs.manager import metadata_to_dto
from backend.schemas.overview import (
    DatasetInfoDTO,
    EquivalenceAuditDTO,
    ModelArchitectureResponse,
    OverviewResponse,
    SequenceLayerDTO,
)
from dashboard.storage import list_experiments
from models.model_loader import (
    LinearLayer,
    MathematicalNetwork,
    ReLULayer,
    inspect_model_architecture,
)


def build_model_architecture(
    pytorch_model: Any,
    network: MathematicalNetwork,
    checkpoint_path: Path,
) -> ModelArchitectureResponse:
    """Build dynamic architecture metadata from the loaded model and extracted network."""
    summary = inspect_model_architecture(pytorch_model)
    sequence: list[SequenceLayerDTO] = []
    for layer in network.layers:
        if isinstance(layer, LinearLayer):
            sequence.append(
                SequenceLayerDTO(
                    position=layer.position,
                    type="linear",
                    input_features=layer.input_features,
                    output_features=layer.output_features,
                )
            )
        elif isinstance(layer, ReLULayer):
            sequence.append(
                SequenceLayerDTO(
                    position=layer.position,
                    type="relu",
                    activation=layer.activation,
                )
            )

    return ModelArchitectureResponse(
        source_model=network.source_model,
        input_features=network.input_features,
        output_features=network.output_features,
        num_linear_layers=int(summary["num_linear_layers"]),
        num_sequence_layers=len(network.layers),
        total_trainable_parameters=int(summary["total_trainable_parameters"]),
        layers=list(summary["layers"]),
        sequence=sequence,
        checkpoint=str(checkpoint_path),
    )


def _load_equivalence_audit(results_dir: Path) -> EquivalenceAuditDTO:
    evidence_path = results_dir / "equivalence_seed39_n100_summary.json"
    if not evidence_path.is_file():
        return EquivalenceAuditDTO(
            available=False,
            error="Equivalence validation summary artifact is not present.",
        )
    try:
        evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
        overall = evidence.get("overall", {})
        mode_b_solves = overall.get("mode_b_total_lp_solves")
        mode_a_solves = overall.get("mode_a_total_lp_solves")
        solves_ratio = (
            float(mode_a_solves) / float(mode_b_solves)
            if mode_a_solves is not None and mode_b_solves
            else None
        )
        return EquivalenceAuditDTO(
            available=True,
            summary=evidence,
            solves_ratio=solves_ratio,
        )
    except Exception as exc:  # noqa: BLE001
        return EquivalenceAuditDTO(
            available=False,
            error=f"Could not parse equivalence audit evidence: {exc}",
        )


def build_overview(
    pytorch_model: Any,
    network: MathematicalNetwork,
    dataset: Any,
    checkpoint_path: Path,
    results_dir: Path,
    experiments_dir: Path,
) -> OverviewResponse:
    """Assemble overview metadata from cached resources and persisted artifacts."""
    experiments = list_experiments(base_dir=experiments_dir)
    latest_completed = next((e for e in experiments if e.status == "Completed"), None)
    return OverviewResponse(
        model=build_model_architecture(pytorch_model, network, checkpoint_path),
        dataset=DatasetInfoDTO(
            name="MNIST",
            split="test",
            total_samples=len(dataset),
        ),
        equivalence_audit=_load_equivalence_audit(results_dir),
        experiments_count=len(experiments),
        latest_completed_experiment=(
            metadata_to_dto(latest_completed) if latest_completed is not None else None
        ),
    )

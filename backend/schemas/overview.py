"""Overview, model architecture, and experiment metadata schemas."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel


class SequenceLayerDTO(BaseModel):
    """Single layer entry in the extracted MathematicalNetwork sequence."""

    position: int
    type: Literal["linear", "relu"]
    input_features: Optional[int] = None
    output_features: Optional[int] = None
    activation: Optional[str] = None


class ModelArchitectureResponse(BaseModel):
    """Dynamic architecture summary from inspect_model_architecture and MathematicalNetwork."""

    source_model: str
    input_features: int
    output_features: int
    num_linear_layers: int
    num_sequence_layers: int
    total_trainable_parameters: int
    layers: list[str]
    sequence: list[SequenceLayerDTO]
    checkpoint: str


class DatasetInfoDTO(BaseModel):
    """Loaded evaluation dataset summary."""

    name: str
    split: str
    total_samples: int


class EquivalenceAuditDTO(BaseModel):
    """Read-only equivalence validation summary loaded from results/."""

    available: bool
    error: Optional[str] = None
    summary: Optional[dict[str, Any]] = None
    solves_ratio: Optional[float] = None


class ExperimentMetadataDTO(BaseModel):
    """Serializable mirror of dashboard.storage.ExperimentMetadata."""

    experiment_id: str
    experiment_type: str
    timestamp: str
    sample_count: int
    epsilons: list[float]
    seed: int
    status: str
    experiment_name: str
    folder_name: str
    error_message: Optional[str] = None


class OverviewResponse(BaseModel):
    """Aggregated metadata powering the Overview view and sidebar."""

    model: ModelArchitectureResponse
    dataset: DatasetInfoDTO
    equivalence_audit: EquivalenceAuditDTO
    experiments_count: int
    latest_completed_experiment: Optional[ExperimentMetadataDTO] = None

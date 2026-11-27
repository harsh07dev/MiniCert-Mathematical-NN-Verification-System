"""Read-only export artifact resolution for CSV and JSON downloads."""

from __future__ import annotations

from pathlib import Path

from backend.services.experiment_service import find_experiment_metadata


def resolve_export_file(
    experiment_id: str,
    filename: str,
    experiments_dir: Path,
) -> Path:
    """Resolve an existing CSV or JSON artifact strictly read-only.

    Never calls ``ExperimentResult.save()`` and never writes or mutates disk.
    Guards against path traversal by verifying the resolved directory lives
    under ``experiments_dir``.
    """
    if (
        not experiment_id
        or "/" in experiment_id
        or "\\" in experiment_id
        or ".." in experiment_id
    ):
        raise ValueError(f"Invalid experiment_id: {experiment_id!r}")

    meta = find_experiment_metadata(experiment_id, experiments_dir)
    if meta is None:
        raise FileNotFoundError(f"Experiment '{experiment_id}' not found")

    base = experiments_dir.resolve()
    exp_dir = meta.path.resolve()
    if exp_dir.parent != base or not exp_dir.is_dir():
        raise FileNotFoundError(f"Experiment '{experiment_id}' not found")

    artifact = (exp_dir / filename).resolve()
    if artifact.parent != exp_dir or not artifact.is_file():
        raise FileNotFoundError(
            f"Export artifact '{filename}' not found for experiment '{experiment_id}'"
        )
    return artifact

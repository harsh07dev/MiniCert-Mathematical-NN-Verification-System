"""Configuration for the MiniCert FastAPI backend."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class BackendConfig:
    """Runtime paths and startup options for the FastAPI application."""

    project_root: Path = PROJECT_ROOT
    checkpoint_path: Path = PROJECT_ROOT / "saved_model.pth"
    data_dir: Path = PROJECT_ROOT / "data"
    results_dir: Path = PROJECT_ROOT / "results"
    experiments_dir: Path = PROJECT_ROOT / "results" / "experiments"
    auto_import_legacy: bool = True
    cors_origins: tuple[str, ...] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    )

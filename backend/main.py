"""FastAPI application factory and lifespan management for MiniCert."""

from __future__ import annotations

from contextlib import asynccontextmanager
import logging
from typing import Any, AsyncIterator, Callable, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import BackendConfig
from backend.dependencies import AppResources
from backend.jobs.manager import ExperimentJobManager
from backend.routes import (
    comparison,
    experiments,
    exports,
    health,
    history,
    overview,
    verification,
)
from dashboard.storage import import_legacy_experiments
from evaluation.dataset import load_mnist_test_dataset
from models.model_loader import extract_network, load_model
from models.network import MiniCertNet

logger = logging.getLogger("minicert.backend")


def create_app(
    config: Optional[BackendConfig] = None,
    *,
    dataset_loader: Optional[Callable[[Any], Any]] = None,
) -> FastAPI:
    """Create and configure the MiniCert FastAPI application."""
    resolved_config = config or BackendConfig()
    load_dataset_fn = dataset_loader or load_mnist_test_dataset

    @asynccontextmanager
    async def lifespan(app_instance: FastAPI) -> AsyncIterator[None]:
        resources = AppResources(config=resolved_config)
        app_instance.state.resources = resources
        job_manager = ExperimentJobManager(max_workers=1)
        resources.job_manager = job_manager

        try:
            pytorch_model = load_model(
                MiniCertNet,
                resolved_config.checkpoint_path,
                device="cpu",
            )
            resources.pytorch_model = pytorch_model
            resources.network = extract_network(pytorch_model)
            resources.dataset = load_dataset_fn(resolved_config.data_dir)
            resolved_config.experiments_dir.mkdir(parents=True, exist_ok=True)
            resources.experiments_dir_ready = True

            if resolved_config.auto_import_legacy:
                imported = import_legacy_experiments(
                    source_dir=resolved_config.results_dir,
                    target_base_dir=resolved_config.experiments_dir,
                )
                resources.legacy_imported_count = len(imported)
        except Exception as exc:  # noqa: BLE001
            logger.exception("MiniCert backend startup failed: %s", exc)
            resources.startup_error = f"{type(exc).__name__}: {exc}"

        try:
            yield
        finally:
            job_manager.shutdown(wait=True)

    application = FastAPI(
        title="MiniCert Verification API",
        description=(
            "FastAPI backend exposing MiniCert's neural network local robustness "
            "verification engine, evaluation experiments, history, and exports."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_config.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(health.router)
    application.include_router(overview.router)
    application.include_router(verification.router)
    application.include_router(experiments.router)
    application.include_router(history.router)
    application.include_router(comparison.router)
    application.include_router(exports.router)

    return application


app = create_app()

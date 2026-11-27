"""Thread-safe single-worker background job manager for MiniCert experiments.

Note on process scope:
    This initial in-memory job manager is intended for a single FastAPI backend
    process. Active and recent job state (QUEUED/RUNNING/COMPLETED/FAILED) lives
    in process memory and is lost if the backend restarts, whereas completed
    experiment artifacts remain persisted on disk under ``results/experiments/``.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
import queue
import threading
import time
from typing import Any, Optional

from backend.schemas.experiments import (
    ExperimentJobAcceptedResponse,
    ExperimentJobStatusResponse,
    JobStatus,
)
from backend.schemas.overview import ExperimentMetadataDTO
from dashboard.storage import ExperimentMetadata, generate_experiment_id, save_experiment
from evaluation.experiment import ExperimentConfig, run_experiment
from models.model_loader import MathematicalNetwork


def metadata_to_dto(meta: ExperimentMetadata) -> ExperimentMetadataDTO:
    """Convert a storage ExperimentMetadata dataclass into its Pydantic DTO."""
    return ExperimentMetadataDTO(
        experiment_id=meta.experiment_id,
        experiment_type=meta.experiment_type,
        timestamp=meta.timestamp,
        sample_count=meta.sample_count,
        epsilons=list(meta.epsilons),
        seed=meta.seed,
        status=meta.status,
        experiment_name=meta.experiment_name,
        folder_name=meta.folder_name,
        error_message=meta.error_message,
    )


@dataclass
class _JobRecord:
    experiment_id: str
    experiment_type: str
    sample_count: int
    epsilons: tuple[float, ...]
    seed: int
    status: JobStatus
    stage: str
    completed_pairs: int
    total_pairs: int
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    start_monotonic: Optional[float] = None
    elapsed_seconds: float = 0.0
    current_epsilon: Optional[float] = None
    current_sample_index: Optional[int] = None
    error: Optional[str] = None
    metadata: Optional[ExperimentMetadataDTO] = None
    subscribers: list[queue.Queue[Optional[dict[str, Any]]]] = field(default_factory=list)

    def to_status_dict(self) -> dict[str, Any]:
        elapsed = self.elapsed_seconds
        if self.status == "RUNNING" and self.start_monotonic is not None:
            elapsed = time.perf_counter() - self.start_monotonic
        pct = (
            100.0 * self.completed_pairs / self.total_pairs
            if self.total_pairs > 0
            else (100.0 if self.status == "COMPLETED" else 0.0)
        )
        return ExperimentJobStatusResponse(
            experiment_id=self.experiment_id,
            status=self.status,
            stage=self.stage,
            experiment_type=self.experiment_type,
            completed_pairs=self.completed_pairs,
            total_pairs=self.total_pairs,
            progress_percent=round(min(100.0, max(0.0, pct)), 2),
            current_epsilon=self.current_epsilon,
            current_sample_index=self.current_sample_index,
            elapsed_seconds=elapsed,
            created_at=self.created_at,
            started_at=self.started_at,
            finished_at=self.finished_at,
            error=self.error,
            metadata=self.metadata,
        ).model_dump()


class ExperimentJobManager:
    """Single-worker ThreadPoolExecutor job manager with SSE subscription support."""

    def __init__(self, max_workers: int = 1) -> None:
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="minicert-exp",
        )
        self._lock = threading.RLock()
        self._jobs: dict[str, _JobRecord] = {}

    def _allocate_unique_id(self, experiment_type: str, experiments_dir: Path) -> str:
        prefix = "dev" if experiment_type == "development" else ""
        for _ in range(16):
            candidate = generate_experiment_id(prefix=prefix)
            folder = experiments_dir / f"experiment_{candidate}"
            if candidate not in self._jobs and not folder.exists():
                return candidate
        raise RuntimeError("Could not allocate a unique experiment_id")

    def submit(
        self,
        *,
        config: ExperimentConfig,
        network: MathematicalNetwork,
        dataset: Any,
        experiment_type: str,
        experiments_dir: Path,
        experiment_runner: Any = None,
        experiment_saver: Any = None,
    ) -> ExperimentJobAcceptedResponse:
        """Enqueue a new experiment run and return its accepted metadata immediately."""
        runner = experiment_runner if experiment_runner is not None else run_experiment
        saver = experiment_saver if experiment_saver is not None else save_experiment
        created_at = datetime.now(timezone.utc).isoformat()
        total_pairs = config.sample_count * len(config.epsilons)

        with self._lock:
            exp_id = self._allocate_unique_id(experiment_type, experiments_dir)
            record = _JobRecord(
                experiment_id=exp_id,
                experiment_type=experiment_type,
                sample_count=config.sample_count,
                epsilons=config.epsilons,
                seed=config.seed,
                status="QUEUED",
                stage="queued",
                completed_pairs=0,
                total_pairs=total_pairs,
                created_at=created_at,
            )
            self._jobs[exp_id] = record

        self._executor.submit(
            self._run_job,
            exp_id,
            config,
            network,
            dataset,
            experiment_type,
            experiments_dir,
            runner,
            saver,
        )

        return ExperimentJobAcceptedResponse(
            experiment_id=exp_id,
            status="QUEUED",
            experiment_type=experiment_type,
            sample_count=config.sample_count,
            epsilons=list(config.epsilons),
            seed=config.seed,
            total_pairs=total_pairs,
            estimated_lp_solves=total_pairs * 20,
            created_at=created_at,
        )

    def _broadcast_locked(self, record: _JobRecord, *, close: bool = False) -> None:
        payload = record.to_status_dict()
        for sub_q in list(record.subscribers):
            sub_q.put(payload)
            if close:
                sub_q.put(None)

    def _run_job(
        self,
        experiment_id: str,
        config: ExperimentConfig,
        network: MathematicalNetwork,
        dataset: Any,
        experiment_type: str,
        experiments_dir: Path,
        experiment_runner: Any,
        experiment_saver: Any,
    ) -> None:
        start_mono = time.perf_counter()
        with self._lock:
            record = self._jobs[experiment_id]
            record.status = "RUNNING"
            record.stage = "selecting_samples"
            record.started_at = datetime.now(timezone.utc).isoformat()
            record.start_monotonic = start_mono
            self._broadcast_locked(record)

        def on_progress(event: dict[str, Any]) -> None:
            with self._lock:
                rec = self._jobs[experiment_id]
                rec.stage = str(event.get("stage", "evaluating"))
                rec.completed_pairs = int(event.get("completed_pairs", rec.completed_pairs))
                rec.total_pairs = int(event.get("total_pairs", rec.total_pairs))
                rec.current_epsilon = event.get("current_epsilon")
                rec.current_sample_index = event.get("current_sample_index")
                rec.elapsed_seconds = time.perf_counter() - start_mono
                self._broadcast_locked(rec)

        try:
            result = experiment_runner(
                config,
                network=network,
                dataset=dataset,
                progress_callback=on_progress,
            )
            with self._lock:
                record = self._jobs[experiment_id]
                record.stage = "saving"
                record.elapsed_seconds = time.perf_counter() - start_mono
                self._broadcast_locked(record)

            meta = experiment_saver(
                result,
                experiment_type=experiment_type,
                experiment_id=experiment_id,
                base_dir=experiments_dir,
            )
            with self._lock:
                record = self._jobs[experiment_id]
                record.status = "COMPLETED"
                record.stage = "completed"
                record.completed_pairs = record.total_pairs
                record.elapsed_seconds = time.perf_counter() - start_mono
                record.finished_at = datetime.now(timezone.utc).isoformat()
                record.metadata = metadata_to_dto(meta)
                self._broadcast_locked(record, close=True)
        except Exception as exc:  # noqa: BLE001
            with self._lock:
                record = self._jobs[experiment_id]
                record.status = "FAILED"
                record.stage = "failed"
                record.elapsed_seconds = time.perf_counter() - start_mono
                record.finished_at = datetime.now(timezone.utc).isoformat()
                record.error = f"{type(exc).__name__}: {exc}"
                self._broadcast_locked(record, close=True)

    def get_status(self, experiment_id: str) -> Optional[dict[str, Any]]:
        """Return the current job status dict, or None if not in memory."""
        with self._lock:
            record = self._jobs.get(experiment_id)
            return record.to_status_dict() if record is not None else None

    def subscribe_with_snapshot(
        self, experiment_id: str
    ) -> Optional[tuple[dict[str, Any], queue.Queue[Optional[dict[str, Any]]]]]:
        """Atomically capture current status and register an SSE subscriber queue."""
        with self._lock:
            record = self._jobs.get(experiment_id)
            if record is None:
                return None
            snapshot = record.to_status_dict()
            sub_q: queue.Queue[Optional[dict[str, Any]]] = queue.Queue()
            if record.status not in ("COMPLETED", "FAILED"):
                record.subscribers.append(sub_q)
            return snapshot, sub_q

    def unsubscribe(
        self, experiment_id: str, sub_q: queue.Queue[Optional[dict[str, Any]]]
    ) -> None:
        """Remove a closed or disconnected SSE subscriber queue."""
        with self._lock:
            record = self._jobs.get(experiment_id)
            if record is not None and sub_q in record.subscribers:
                record.subscribers.remove(sub_q)

    def active_count(self) -> int:
        """Return count of QUEUED or RUNNING jobs."""
        with self._lock:
            return sum(
                1 for rec in self._jobs.values() if rec.status in ("QUEUED", "RUNNING")
            )

    def shutdown(self, wait: bool = True) -> None:
        """Shut down the worker executor cleanly."""
        self._executor.shutdown(wait=wait)

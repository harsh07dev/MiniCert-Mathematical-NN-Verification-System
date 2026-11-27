"""Experiment execution, SSE progress, polling status, and results endpoints."""

from __future__ import annotations

import asyncio
import json
import queue
from typing import Any, AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from backend.dependencies import AppResources, require_ready_resources
from backend.jobs.manager import metadata_to_dto
from backend.schemas.experiments import (
    ExperimentCreateRequest,
    ExperimentJobAcceptedResponse,
    ExperimentJobStatusResponse,
    ExperimentResultsResponse,
    JobStatus,
)
from backend.services.experiment_service import (
    ExperimentNotLoadableError,
    build_experiment_config,
    find_experiment_metadata,
    get_experiment_results,
)
from dashboard.storage import ExperimentMetadata

router = APIRouter(prefix="/api/experiments", tags=["experiments"])


def _disk_status_snapshot(meta: ExperimentMetadata) -> dict[str, Any]:
    """Synthesize a terminal job status payload from persisted experiment metadata."""
    total_pairs = meta.sample_count * len(meta.epsilons)
    mapped_status: JobStatus = "COMPLETED" if meta.status == "Completed" else "FAILED"
    completed_pairs = total_pairs if mapped_status == "COMPLETED" else 0
    return ExperimentJobStatusResponse(
        experiment_id=meta.experiment_id,
        status=mapped_status,
        stage="completed" if mapped_status == "COMPLETED" else "failed",
        experiment_type=meta.experiment_type,
        completed_pairs=completed_pairs,
        total_pairs=total_pairs,
        progress_percent=100.0 if mapped_status == "COMPLETED" else 0.0,
        current_epsilon=None,
        current_sample_index=None,
        elapsed_seconds=0.0,
        created_at=meta.timestamp,
        started_at=meta.timestamp,
        finished_at=meta.timestamp,
        error=meta.error_message,
        metadata=metadata_to_dto(meta),
    ).model_dump()


def _format_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post(
    "",
    response_model=ExperimentJobAcceptedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_experiment(
    body: ExperimentCreateRequest,
    resources: AppResources = Depends(require_ready_resources),
) -> ExperimentJobAcceptedResponse:
    """Validate configuration and enqueue a background evaluation experiment."""
    assert resources.network is not None
    assert resources.job_manager is not None

    try:
        cfg = build_experiment_config(
            body,
            config=resources.config,
            dataset_size=len(resources.dataset),
        )
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    return resources.job_manager.submit(
        config=cfg,
        network=resources.network,
        dataset=resources.dataset,
        experiment_type=body.experiment_type,
        experiments_dir=resources.config.experiments_dir,
    )


@router.get("/{experiment_id}/status", response_model=ExperimentJobStatusResponse)
def get_experiment_status(
    experiment_id: str,
    resources: AppResources = Depends(require_ready_resources),
) -> ExperimentJobStatusResponse:
    """Polling fallback endpoint returning live or persisted experiment status."""
    assert resources.job_manager is not None
    snapshot = resources.job_manager.get_status(experiment_id)
    if snapshot is not None:
        return ExperimentJobStatusResponse(**snapshot)

    meta = find_experiment_metadata(experiment_id, resources.config.experiments_dir)
    if meta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Experiment '{experiment_id}' not found.",
        )
    return ExperimentJobStatusResponse(**_disk_status_snapshot(meta))


@router.get("/{experiment_id}/events")
async def stream_experiment_events(
    experiment_id: str,
    request: Request,
    resources: AppResources = Depends(require_ready_resources),
) -> StreamingResponse:
    """Server-Sent Events (SSE) stream for real-time experiment progress updates."""
    assert resources.job_manager is not None
    job_manager = resources.job_manager

    subscription = job_manager.subscribe_with_snapshot(experiment_id)
    if subscription is None:
        meta = find_experiment_metadata(experiment_id, resources.config.experiments_dir)
        if meta is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Experiment '{experiment_id}' not found.",
            )
        disk_snapshot = _disk_status_snapshot(meta)
        terminal_event = (
            "completed" if disk_snapshot["status"] == "COMPLETED" else "failed"
        )

        async def disk_stream() -> AsyncIterator[str]:
            yield _format_sse(terminal_event, disk_snapshot)

        return StreamingResponse(
            disk_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    initial_snapshot, sub_q = subscription

    async def event_stream() -> AsyncIterator[str]:
        try:
            initial_event = (
                "completed"
                if initial_snapshot["status"] == "COMPLETED"
                else "failed"
                if initial_snapshot["status"] == "FAILED"
                else "status"
            )
            yield _format_sse(initial_event, initial_snapshot)
            if initial_snapshot["status"] in ("COMPLETED", "FAILED"):
                return

            while True:
                if await request.is_disconnected():
                    break
                try:
                    item = await asyncio.to_thread(sub_q.get, True, 0.5)
                except queue.Empty:
                    yield ": keepalive\n\n"
                    continue
                if item is None:
                    break
                event_name = (
                    "completed"
                    if item["status"] == "COMPLETED"
                    else "failed"
                    if item["status"] == "FAILED"
                    else "progress"
                )
                yield _format_sse(event_name, item)
                if item["status"] in ("COMPLETED", "FAILED"):
                    break
        finally:
            job_manager.unsubscribe(experiment_id, sub_q)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{experiment_id}/results", response_model=ExperimentResultsResponse)
def get_results(
    experiment_id: str,
    resources: AppResources = Depends(require_ready_resources),
) -> ExperimentResultsResponse:
    """Return full aggregated metrics, chart series, and per-sample records."""
    try:
        return get_experiment_results(experiment_id, resources.config.experiments_dir)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ExperimentNotLoadableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

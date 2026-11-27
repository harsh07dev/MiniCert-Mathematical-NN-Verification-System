"""Comprehensive tests for the MiniCert FastAPI backend (Phase 2).

All tests use isolated temporary directories for results/experiments so the
real repository experiment history under ``results/`` is never mutated.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path
import shutil
import time
from typing import Any

from fastapi.testclient import TestClient
import numpy as np
import pytest
import torch

from backend.config import BackendConfig
from backend.main import create_app
from dashboard import storage
from dashboard.services import (
    run_baseline_verification,
    run_refined_verification,
)
from evaluation.dataset import InputSample, flatten_image, load_mnist_test_dataset
from evaluation.experiment import ExperimentConfig, ExperimentResult, load_trained_network
from evaluation.metrics import (
    BoundTighteningMetrics,
    CertificationMetrics,
    EpsilonMetrics,
    RuntimeMetrics,
    SampleRecord,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REAL_CHECKPOINT = PROJECT_ROOT / "saved_model.pth"
REAL_DATA_DIR = PROJECT_ROOT / "data"
REAL_EQUIVALENCE_JSON = PROJECT_ROOT / "results" / "equivalence_seed39_n100_summary.json"


def _make_sample_record(sample_index: int = 0, epsilon: float = 0.03, **overrides: Any) -> SampleRecord:
    defaults: dict[str, Any] = dict(
        sample_index=sample_index,
        label=7,
        predicted=7,
        target_class=7,
        epsilon=epsilon,
        baseline_status="INCONCLUSIVE",
        baseline_margin=-2.5,
        baseline_time_seconds=0.0005,
        refined_status="CERTIFIED",
        refined_margin=1.25,
        refined_time_seconds=0.8,
        lp_refinement_time_seconds=0.79,
        refinement_status="TIGHTENED",
        refinement_targets=10,
        refinement_accepted=10,
        refinement_rejected=0,
        baseline_width_mean=12.0,
        refined_width_mean=2.4,
        abs_width_reduction_mean=9.6,
        rel_width_reduction_mean=0.8,
        zero_width_baseline_intervals=0,
        error=None,
    )
    defaults.update(overrides)
    return SampleRecord(**defaults)


def _make_epsilon_metrics(epsilon: float = 0.03, baseline_rate: float | None = 0.0, refined_rate: float | None = 1.0) -> EpsilonMetrics:
    improvement = (
        100.0 * (refined_rate - baseline_rate)
        if baseline_rate is not None and refined_rate is not None
        else None
    )
    return EpsilonMetrics(
        epsilon=epsilon,
        certification=CertificationMetrics(
            epsilon=epsilon,
            total_test_samples=10000,
            evaluated_samples=2,
            incorrect_excluded=0,
            baseline_certified=0 if not baseline_rate else 2,
            refined_certified=2 if refined_rate == 1.0 else 0,
            baseline_rate=baseline_rate,
            refined_rate=refined_rate,
            improvement_pp=improvement,
            baseline_inconclusive=2,
            refined_inconclusive=0 if refined_rate == 1.0 else 2,
            baseline_errors=0,
            refined_errors=0,
        ),
        bounds=BoundTighteningMetrics(
            mean_baseline_width=None if baseline_rate is None else 12.0,
            mean_refined_width=None if refined_rate is None else 2.4,
            mean_abs_width_reduction=None if baseline_rate is None else 9.6,
            mean_relative_width_reduction=None if baseline_rate is None else 0.8,
            zero_width_baseline_intervals=0,
            measured_samples=0 if baseline_rate is None else 2,
        ),
        runtime=RuntimeMetrics(
            mean_baseline_time=None if baseline_rate is None else 0.0005,
            median_baseline_time=None if baseline_rate is None else 0.0005,
            mean_lp_refinement_time=None if refined_rate is None else 0.79,
            median_lp_refinement_time=None if refined_rate is None else 0.79,
            mean_total_refined_time=None if refined_rate is None else 0.8,
            median_total_refined_time=None if refined_rate is None else 0.8,
            baseline_times_measured=0 if baseline_rate is None else 2,
            lp_times_measured=0 if refined_rate is None else 2,
            refined_times_measured=0 if refined_rate is None else 2,
        ),
    )


def _save_synthetic_experiment(
    experiments_dir: Path,
    *,
    experiment_id: str,
    experiment_type: str = "configured",
    epsilons: tuple[float, ...] = (0.01, 0.03),
    sample_count: int = 2,
    seed: int = 42,
    timestamp: str = "2026-11-20T12:00:00+00:00",
    missing_metrics: bool = False,
) -> None:
    from evaluation.dataset import SampleSelection

    records = [
        _make_sample_record(sample_index=idx, epsilon=eps)
        for eps in epsilons
        for idx in range(sample_count)
    ]
    metrics = [
        _make_epsilon_metrics(
            epsilon=eps,
            baseline_rate=None if missing_metrics else 0.0,
            refined_rate=None if missing_metrics else 1.0,
        )
        for eps in epsilons
    ]
    cfg = ExperimentConfig(
        sample_count=sample_count,
        epsilons=epsilons,
        seed=seed,
        data_dir=REAL_DATA_DIR,
        checkpoint=REAL_CHECKPOINT,
        output_dir=experiments_dir,
        experiment_name=experiment_id,
    )
    res = ExperimentResult(
        config=cfg,
        selection=SampleSelection(
            samples=(),
            requested_count=sample_count,
            incorrect_excluded=0,
            scanned=sample_count,
            seed=seed,
        ),
        metrics=tuple(metrics),
        records=tuple(records),
        network_source="MiniCertNet",
        dataset_size=10000,
    )
    storage.save_experiment(
        res,
        experiment_type=experiment_type,
        experiment_id=experiment_id,
        base_dir=experiments_dir,
        timestamp=timestamp,
    )


class _TinyDataset:
    """Deterministic MNIST-shaped synthetic dataset for fast job/API tests."""

    def __init__(self, count: int = 12) -> None:
        rng = np.random.default_rng(123)
        self._items = [
            (torch.from_numpy(rng.uniform(0.0, 1.0, size=(1, 28, 28)).astype(np.float32)), idx % 10)
            for idx in range(count)
        ]

    def __len__(self) -> int:
        return len(self._items)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        return self._items[index]


@pytest.fixture
def isolated_env(tmp_path: Path):
    """Build an isolated results/experiments environment using real checkpoint and dataset."""
    if not REAL_CHECKPOINT.is_file() or not REAL_DATA_DIR.is_dir():
        pytest.skip("Real saved_model.pth and data/ are required for backend integration tests")

    results_dir = tmp_path / "results"
    experiments_dir = results_dir / "experiments"
    results_dir.mkdir(parents=True)
    experiments_dir.mkdir(parents=True)
    if REAL_EQUIVALENCE_JSON.is_file():
        shutil.copy2(REAL_EQUIVALENCE_JSON, results_dir / REAL_EQUIVALENCE_JSON.name)

    cfg = BackendConfig(
        project_root=PROJECT_ROOT,
        checkpoint_path=REAL_CHECKPOINT,
        data_dir=REAL_DATA_DIR,
        results_dir=results_dir,
        experiments_dir=experiments_dir,
        auto_import_legacy=True,
    )
    app = create_app(cfg)
    with TestClient(app) as client:
        yield client, cfg, app


# ---------------------------------------------------------------------------
# 1. Health, Startup Resources & Dynamic Architecture
# ---------------------------------------------------------------------------


def test_health_and_startup_resources_cached_once(isolated_env, monkeypatch: pytest.MonkeyPatch) -> None:
    client, cfg, app = isolated_env

    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["model_loaded"] is True
    assert data["network_loaded"] is True
    assert data["dataset_loaded"] is True
    assert data["dataset_size"] == 10000
    assert data["experiments_dir_ready"] is True
    assert data["startup_error"] is None

    # Verify cached objects are reused across requests without reloading
    resources = app.state.resources
    first_net = resources.network
    first_ds = resources.dataset
    assert client.get("/api/overview").status_code == 200
    assert app.state.resources.network is first_net
    assert app.state.resources.dataset is first_ds


def test_startup_failure_reports_unhealthy_503(tmp_path: Path) -> None:
    bad_cfg = BackendConfig(
        project_root=PROJECT_ROOT,
        checkpoint_path=tmp_path / "missing_checkpoint.pth",
        data_dir=REAL_DATA_DIR,
        results_dir=tmp_path / "results",
        experiments_dir=tmp_path / "results" / "experiments",
        auto_import_legacy=False,
    )
    app = create_app(bad_cfg)
    with TestClient(app) as client:
        health = client.get("/api/health")
        assert health.status_code == 503
        body = health.json()
        assert body["status"] == "unhealthy"
        assert body["model_loaded"] is False
        assert "FileNotFoundError" in body["startup_error"]

        arch = client.get("/api/model/architecture")
        assert arch.status_code == 503


def test_dynamic_model_architecture_and_overview(isolated_env) -> None:
    client, _, _ = isolated_env

    arch_resp = client.get("/api/model/architecture")
    assert arch_resp.status_code == 200
    arch = arch_resp.json()
    assert arch["source_model"] == "MiniCertNet"
    assert arch["input_features"] == 784
    assert arch["output_features"] == 10
    assert arch["num_linear_layers"] == 3
    assert arch["num_sequence_layers"] == 5
    assert arch["total_trainable_parameters"] == 52650
    assert arch["layers"] == [
        "Linear(784 -> 64)",
        "Linear(64 -> 32)",
        "Linear(32 -> 10)",
    ]
    assert [s["type"] for s in arch["sequence"]] == [
        "linear",
        "relu",
        "linear",
        "relu",
        "linear",
    ]

    ov_resp = client.get("/api/overview")
    assert ov_resp.status_code == 200
    ov = ov_resp.json()
    assert ov["model"] == arch
    assert ov["dataset"] == {"name": "MNIST", "split": "test", "total_samples": 10000}
    if REAL_EQUIVALENCE_JSON.is_file():
        assert ov["equivalence_audit"]["available"] is True
        assert ov["equivalence_audit"]["summary"]["overall"]["completed_pairs"] == 400
        assert ov["equivalence_audit"]["solves_ratio"] == pytest.approx(44686 / 8000)


# ---------------------------------------------------------------------------
# 2. Request Validation & Individual Verification + Numerical Parity
# ---------------------------------------------------------------------------


def test_sample_preview_and_validation(isolated_env) -> None:
    client, _, _ = isolated_env

    sample_resp = client.get("/api/samples/0")
    assert sample_resp.status_code == 200
    sample = sample_resp.json()
    assert sample["sample_index"] == 0
    assert len(sample["image"]) == 28
    assert len(sample["image"][0]) == 28
    assert len(sample["logits"]) == 10

    assert client.get("/api/samples/10000").status_code == 422
    assert client.get("/api/samples/-1").status_code == 422

    # Verification validation errors
    assert client.post("/api/verification", json={"sample_index": 0, "epsilon": -0.01}).status_code == 422
    assert client.post("/api/verification", json={"sample_index": 0, "epsilon": "nan"}).status_code == 422
    assert client.post("/api/verification", json={"sample_index": True, "epsilon": 0.03}).status_code == 422
    assert client.post("/api/verification", json={"sample_index": 0, "epsilon": True}).status_code == 422
    assert client.post("/api/verification", json={"sample_index": 10000, "epsilon": 0.03}).status_code == 422


def test_individual_verification_numerical_parity_with_engine(isolated_env) -> None:
    client, _, _ = isolated_env

    # Compare API results bit-for-bit against direct Python verification engine calls
    sample_index = 0
    epsilon = 0.01

    resp = client.post(
        "/api/verification",
        json={"sample_index": sample_index, "epsilon": epsilon, "mode": "both"},
    )
    assert resp.status_code == 200
    body = resp.json()

    network = load_trained_network(REAL_CHECKPOINT)
    dataset = load_mnist_test_dataset(REAL_DATA_DIR)
    img_tensor, label = dataset[sample_index]
    vec = flatten_image(img_tensor)
    logits = np.asarray(network.forward(vec), dtype=np.float64)
    predicted = int(np.argmax(logits))
    input_sample = InputSample(index=sample_index, image=vec, label=int(label), predicted=predicted)

    direct_base = run_baseline_verification(network, input_sample, epsilon)
    direct_ref = run_refined_verification(network, input_sample, epsilon)

    assert body["label"] == int(label)
    assert body["predicted"] == predicted
    assert body["target_class"] == predicted
    assert np.array_equal(np.array(body["logits"]), logits)

    # Baseline parity
    assert body["baseline"]["status"] == direct_base.baseline_status
    assert body["baseline"]["margin"] == pytest.approx(direct_base.baseline_margin, rel=0, abs=0)
    assert np.array_equal(np.array(body["baseline"]["lower"]), direct_base.baseline_lower)
    assert np.array_equal(np.array(body["baseline"]["upper"]), direct_base.baseline_upper)

    # Refined parity (verifying L4-only default: 10 output targets)
    assert body["refined"]["status"] == direct_ref.refined_status
    assert body["refined"]["margin"] == pytest.approx(direct_ref.refined_margin, rel=0, abs=0)
    assert body["refined"]["refinement_targets"] == 10
    assert body["refined"]["refinement_targets"] == direct_ref.refinement_targets
    assert body["refined"]["refinement_accepted"] == direct_ref.refinement_accepted
    assert np.array_equal(np.array(body["refined"]["lower"]), direct_ref.refined_lower)
    assert np.array_equal(np.array(body["refined"]["upper"]), direct_ref.refined_upper)

    # Per-class bounds table parity
    assert len(body["per_class_bounds"]) == 10
    target_row = next(r for r in body["per_class_bounds"] if r["is_target"])
    assert target_row["class_index"] == predicted
    assert target_row["baseline_lower"] == direct_base.baseline_lower[predicted]
    assert target_row["refined_lower"] == direct_ref.refined_lower[predicted]


# ---------------------------------------------------------------------------
# 3. Background Experiments, SSE Delivery, Polling Fallback & Failure Handling
# ---------------------------------------------------------------------------


def test_experiment_background_execution_sse_and_polling_and_persistence(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if not REAL_CHECKPOINT.is_file():
        pytest.skip("saved_model.pth required")

    results_dir = tmp_path / "results"
    experiments_dir = results_dir / "experiments"
    results_dir.mkdir(parents=True)
    experiments_dir.mkdir(parents=True)

    tiny_ds = _TinyDataset(count=12)
    cfg = BackendConfig(
        project_root=PROJECT_ROOT,
        checkpoint_path=REAL_CHECKPOINT,
        data_dir=REAL_DATA_DIR,
        results_dir=results_dir,
        experiments_dir=experiments_dir,
        auto_import_legacy=False,
    )

    # Fast deterministic mock runner that invokes progress_callback cleanly
    def fake_run_experiment(exp_cfg, *, network=None, dataset=None, progress_callback=None):
        from evaluation.dataset import SampleSelection

        total = exp_cfg.sample_count * len(exp_cfg.epsilons)
        if progress_callback:
            progress_callback({"stage": "selecting_samples", "completed_pairs": 0, "total_pairs": total, "current_epsilon": None, "current_sample_index": None})
        records = []
        done = 0
        for eps in exp_cfg.epsilons:
            for idx in range(exp_cfg.sample_count):
                time.sleep(0.02)
                records.append(_make_sample_record(sample_index=idx, epsilon=eps))
                done += 1
                if progress_callback:
                    progress_callback({"stage": "evaluating", "completed_pairs": done, "total_pairs": total, "current_epsilon": eps, "current_sample_index": idx})
        metrics = [_make_epsilon_metrics(epsilon=eps) for eps in exp_cfg.epsilons]
        return ExperimentResult(
            config=exp_cfg,
            selection=SampleSelection(samples=(), requested_count=exp_cfg.sample_count, incorrect_excluded=0, scanned=exp_cfg.sample_count, seed=exp_cfg.seed),
            metrics=tuple(metrics),
            records=tuple(records),
            network_source="MiniCertNet",
            dataset_size=len(dataset),
        )

    import backend.jobs.manager as job_mgr_mod
    monkeypatch.setattr(job_mgr_mod, "run_experiment", fake_run_experiment)

    app = create_app(cfg, dataset_loader=lambda _p: tiny_ds)
    with TestClient(app) as client:
        # Invalid requests fail cleanly
        assert client.post("/api/experiments", json={"experiment_type": "configured", "sample_count": 0}).status_code == 422
        assert client.post("/api/experiments", json={"experiment_type": "configured", "sample_count": 999}).status_code == 422
        assert client.post("/api/experiments", json={"experiment_type": "configured", "epsilons": "-0.1"}).status_code == 422

        # Submit development run
        create_resp = client.post("/api/experiments", json={"experiment_type": "development"})
        assert create_resp.status_code == 202
        accepted = create_resp.json()
        exp_id = accepted["experiment_id"]
        assert accepted["status"] == "QUEUED"
        assert accepted["total_pairs"] == 5
        assert accepted["epsilons"] == [0.03]

        # Consume SSE stream until completed
        events: list[tuple[str, dict[str, Any]]] = []
        with client.stream("GET", f"/api/experiments/{exp_id}/events") as stream:
            assert stream.status_code == 200
            current_event = ""
            for line in stream.iter_lines():
                if line.startswith("event: "):
                    current_event = line.removeprefix("event: ").strip()
                elif line.startswith("data: "):
                    payload = json.loads(line.removeprefix("data: ").strip())
                    events.append((current_event, payload))

        assert events
        assert events[-1][0] == "completed"
        assert events[-1][1]["status"] == "COMPLETED"
        assert events[-1][1]["completed_pairs"] == 5

        # Polling fallback also returns COMPLETED
        poll = client.get(f"/api/experiments/{exp_id}/status")
        assert poll.status_code == 200
        assert poll.json()["status"] == "COMPLETED"
        assert poll.json()["progress_percent"] == 100.0

        # Persisted on disk and readable via results endpoint
        exp_dir = experiments_dir / f"experiment_{exp_id}"
        assert (exp_dir / "config.json").is_file()
        assert (exp_dir / "summary.json").is_file()
        assert (exp_dir / "samples.csv").is_file()

        res_resp = client.get(f"/api/experiments/{exp_id}/results")
        assert res_resp.status_code == 200
        assert res_resp.json()["metadata"]["experiment_id"] == exp_id
        assert len(res_resp.json()["records"]) == 5


def test_failed_experiment_does_not_stay_running(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if not REAL_CHECKPOINT.is_file():
        pytest.skip("saved_model.pth required")

    results_dir = tmp_path / "results"
    experiments_dir = results_dir / "experiments"
    results_dir.mkdir(parents=True)
    experiments_dir.mkdir(parents=True)

    def crashing_runner(*args, **kwargs):
        raise RuntimeError("Simulated HiGHS crash")

    import backend.jobs.manager as job_mgr_mod
    monkeypatch.setattr(job_mgr_mod, "run_experiment", crashing_runner)

    cfg = BackendConfig(
        project_root=PROJECT_ROOT,
        checkpoint_path=REAL_CHECKPOINT,
        data_dir=REAL_DATA_DIR,
        results_dir=results_dir,
        experiments_dir=experiments_dir,
        auto_import_legacy=False,
    )
    app = create_app(cfg, dataset_loader=lambda _p: _TinyDataset(5))
    with TestClient(app) as client:
        resp = client.post(
            "/api/experiments",
            json={"experiment_type": "configured", "sample_count": 2, "epsilons": [0.03], "seed": 1},
        )
        assert resp.status_code == 202
        exp_id = resp.json()["experiment_id"]

        # Poll until terminal FAILED state
        deadline = time.time() + 5.0
        status_payload = {}
        while time.time() < deadline:
            status_payload = client.get(f"/api/experiments/{exp_id}/status").json()
            if status_payload["status"] in ("COMPLETED", "FAILED"):
                break
            time.sleep(0.02)

        assert status_payload["status"] == "FAILED"
        assert "RuntimeError: Simulated HiGHS crash" in status_payload["error"]
        assert client.app.state.resources.job_manager.active_count() == 0


# ---------------------------------------------------------------------------
# 4. History, Comparison, Read-Only Exports & Legacy Import Idempotency
# ---------------------------------------------------------------------------


def test_history_incomplete_corrupted_and_legacy_import_idempotency(tmp_path: Path) -> None:
    if not REAL_CHECKPOINT.is_file():
        pytest.skip("saved_model.pth required")

    results_dir = tmp_path / "results"
    experiments_dir = results_dir / "experiments"
    results_dir.mkdir(parents=True)
    experiments_dir.mkdir(parents=True)

    # Legacy run in results/ ready for auto-import
    legacy_summary = {
        "config": {"sample_count": 1, "epsilons": [0.03], "seed": 42, "experiment_name": "evaluation_seed42_n5"},
        "results": [_make_epsilon_metrics(0.03).__dict__],
    }
    # Use proper serializable dict via ExperimentResult
    _save_synthetic_experiment(experiments_dir, experiment_id="existing_exp_01")
    legacy_summary_dict = json.loads((experiments_dir / "experiment_existing_exp_01" / "summary.json").read_text(encoding="utf-8"))
    legacy_summary_dict["config"]["sample_count"] = 1
    legacy_summary_dict["config"]["epsilons"] = [0.03]
    legacy_summary_dict["results"] = [legacy_summary_dict["results"][0]]
    (results_dir / "evaluation_seed42_n5_summary.json").write_text(json.dumps(legacy_summary_dict), encoding="utf-8")
    csv_header = ",".join(SampleRecord.CSV_FIELDNAMES)
    row_line = ",".join(_make_sample_record(0, 0.03).to_row()[col] for col in SampleRecord.CSV_FIELDNAMES)
    (results_dir / "evaluation_seed42_n5_samples.csv").write_text(f"{csv_header}\n{row_line}\n", encoding="utf-8")

    # Incomplete folder
    incomplete_dir = experiments_dir / "experiment_incomplete_run"
    incomplete_dir.mkdir()
    (incomplete_dir / "config.json").write_text(json.dumps({"experiment_id": "incomplete_run", "sample_count": 2, "epsilons": [0.03], "seed": 42}), encoding="utf-8")

    cfg = BackendConfig(
        project_root=PROJECT_ROOT,
        checkpoint_path=REAL_CHECKPOINT,
        data_dir=REAL_DATA_DIR,
        results_dir=results_dir,
        experiments_dir=experiments_dir,
        auto_import_legacy=True,
    )
    app = create_app(cfg, dataset_loader=lambda _p: _TinyDataset(5))
    with TestClient(app) as client:
        health = client.get("/api/health").json()
        assert health["legacy_imported_count"] == 1

        # Refresh again -> idempotent (0 new imports)
        refresh = client.post("/api/history/refresh")
        assert refresh.status_code == 200
        assert refresh.json()["imported_count"] == 0

        hist = client.get("/api/history")
        assert hist.status_code == 200
        ids = {e["experiment_id"] for e in hist.json()["experiments"]}
        assert {"existing_exp_01", "dev_seed42_n5", "incomplete_run"}.issubset(ids)

        # Incomplete run: history detail returns loadable=False; results endpoint returns 409
        inc_detail = client.get("/api/history/incomplete_run")
        assert inc_detail.status_code == 200
        assert inc_detail.json()["loadable"] is False
        assert inc_detail.json()["metadata"]["status"] == "Incomplete"

        assert client.get("/api/experiments/incomplete_run/results").status_code == 409
        assert client.get("/api/history/nonexistent_xyz").status_code == 404


def test_comparison_and_read_only_exports(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    if not REAL_CHECKPOINT.is_file():
        pytest.skip("saved_model.pth required")

    results_dir = tmp_path / "results"
    experiments_dir = results_dir / "experiments"
    experiments_dir.mkdir(parents=True)

    _save_synthetic_experiment(
        experiments_dir,
        experiment_id="exp_alpha",
        epsilons=(0.01, 0.03),
        sample_count=2,
        seed=42,
        timestamp="2026-11-20T10:00:00+00:00",
    )
    _save_synthetic_experiment(
        experiments_dir,
        experiment_id="exp_beta",
        epsilons=(0.03, 0.05),
        sample_count=3,
        seed=99,
        timestamp="2026-11-21T10:00:00+00:00",
        missing_metrics=True,
    )

    # Guard against ANY ExperimentResult.save() call during read/export routes
    def forbid_save(*args, **kwargs):
        raise AssertionError("Read/export routes must NEVER call ExperimentResult.save()")

    monkeypatch.setattr(ExperimentResult, "save", forbid_save)

    cfg = BackendConfig(
        project_root=PROJECT_ROOT,
        checkpoint_path=REAL_CHECKPOINT,
        data_dir=REAL_DATA_DIR,
        results_dir=results_dir,
        experiments_dir=experiments_dir,
        auto_import_legacy=False,
    )
    app = create_app(cfg, dataset_loader=lambda _p: _TinyDataset(5))
    with TestClient(app) as client:
        # Comparison validation
        assert client.post("/api/comparison", json={"experiment_ids": ["exp_alpha"]}).status_code == 422
        assert client.post("/api/comparison", json={"experiment_ids": ["exp_alpha", "exp_alpha"]}).status_code == 422
        assert client.post("/api/comparison", json={"experiment_ids": ["exp_alpha", "missing"]}).status_code == 404

        cmp_resp = client.post(
            "/api/comparison",
            json={"experiment_ids": ["exp_alpha", "exp_beta"]},
        )
        assert cmp_resp.status_code == 200
        cmp_data = cmp_resp.json()
        assert cmp_data["matching_epsilons"] == [0.03]
        assert cmp_data["all_epsilons"] == [0.01, 0.03, 0.05]
        assert cmp_data["sample_counts_differ"] is True
        assert cmp_data["seeds_differ"] is True
        assert cmp_data["identical_samples"] is False
        assert len(cmp_data["tables"]) == 1
        assert len(cmp_data["tables"][0]["rows"]) == 10
        # Missing metric in exp_beta must stay "—" (never "0")
        beta_label = cmp_data["experiments"][1]["display_label"]
        assert cmp_data["tables"][0]["rows"][0][beta_label] == "—"

        # Read-only CSV & JSON export parity + mtime invariance
        csv_file = experiments_dir / "experiment_exp_alpha" / "samples.csv"
        json_file = experiments_dir / "experiment_exp_alpha" / "summary.json"
        csv_before = csv_file.read_bytes()
        json_before = json_file.read_bytes()
        dir_before = sorted(p.name for p in (experiments_dir / "experiment_exp_alpha").iterdir())

        assert client.get("/api/experiments/exp_alpha/results").status_code == 200
        assert client.get("/api/history/exp_alpha").status_code == 200

        csv_dl = client.get("/api/exports/exp_alpha/csv")
        assert csv_dl.status_code == 200
        assert csv_dl.content == csv_before
        rows = list(csv.DictReader(csv_dl.text.splitlines()))
        assert len(rows) == 4  # 2 samples * 2 epsilons

        json_dl = client.get("/api/exports/exp_alpha/json")
        assert json_dl.status_code == 200
        assert json_dl.content == json_before

        assert sorted(p.name for p in (experiments_dir / "experiment_exp_alpha").iterdir()) == dir_before
        assert client.get("/api/exports/does_not_exist/csv").status_code == 404
        assert client.get("/api/exports/..%2F..%2Fetc/csv").status_code in (404, 422)


def test_progress_callback_preserves_exact_experiment_parity(tmp_path: Path) -> None:
    if not REAL_CHECKPOINT.is_file() or not REAL_DATA_DIR.is_dir():
        pytest.skip("Real saved_model.pth and data/ required")

    from evaluation.experiment import run_experiment

    network = load_trained_network(REAL_CHECKPOINT)
    dataset = load_mnist_test_dataset(REAL_DATA_DIR)
    cfg = ExperimentConfig(
        sample_count=2,
        epsilons=(0.01,),
        seed=42,
        data_dir=REAL_DATA_DIR,
        checkpoint=REAL_CHECKPOINT,
        output_dir=tmp_path,
    )
    baseline_res = run_experiment(cfg, network=network, dataset=dataset)
    events: list[dict[str, Any]] = []
    callback_res = run_experiment(
        cfg,
        network=network,
        dataset=dataset,
        progress_callback=events.append,
    )

    assert len(events) == 3  # selecting_samples + 2 samples
    assert events[0]["stage"] == "selecting_samples"
    assert [e["completed_pairs"] for e in events[1:]] == [1, 2]
    assert [s.index for s in callback_res.selection.samples] == [
        s.index for s in baseline_res.selection.samples
    ]
    assert callback_res.selection.incorrect_excluded == baseline_res.selection.incorrect_excluded
    assert callback_res.selection.scanned == baseline_res.selection.scanned
    for s_cb, s_base in zip(callback_res.selection.samples, baseline_res.selection.samples, strict=True):
        assert np.array_equal(s_cb.image, s_base.image)
        assert s_cb.label == s_base.label
        assert s_cb.predicted == s_base.predicted

    assert [m.certification for m in callback_res.metrics] == [
        m.certification for m in baseline_res.metrics
    ]
    assert [m.bounds for m in callback_res.metrics] == [
        m.bounds for m in baseline_res.metrics
    ]
    assert [
        (r.sample_index, r.baseline_status, r.baseline_margin, r.refined_status, r.refined_margin, r.baseline_width_mean, r.refined_width_mean)
        for r in callback_res.records
    ] == [
        (r.sample_index, r.baseline_status, r.baseline_margin, r.refined_status, r.refined_margin, r.baseline_width_mean, r.refined_width_mean)
        for r in baseline_res.records
    ]


def test_sse_client_disconnect_cleanup() -> None:
    from backend.jobs.manager import ExperimentJobManager

    mgr = ExperimentJobManager(max_workers=1)
    try:
        # Simulate subscriber registration and disconnect cleanup
        from backend.jobs.manager import _JobRecord

        rec = _JobRecord(
            experiment_id="sse_test_1",
            experiment_type="configured",
            sample_count=1,
            epsilons=(0.03,),
            seed=42,
            status="RUNNING",
            stage="evaluating",
            completed_pairs=0,
            total_pairs=1,
            created_at="2026-11-28T00:00:00+00:00",
        )
        mgr._jobs["sse_test_1"] = rec
        sub = mgr.subscribe_with_snapshot("sse_test_1")
        assert sub is not None
        snapshot, sub_q = sub
        assert snapshot["status"] == "RUNNING"
        assert len(rec.subscribers) == 1
        mgr.unsubscribe("sse_test_1", sub_q)
        assert len(rec.subscribers) == 0
    finally:
        mgr.shutdown(wait=True)


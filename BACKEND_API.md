# MiniCert — FastAPI Backend API Reference

**Version:** `0.1.0`  
**Entrypoint:** `backend.main:app` (factory: `backend.main.create_app`)  
**Runtime Scope:** Single-process local/research ASGI service running alongside the existing Streamlit dashboard (`dashboard/app.py`).

---

## 1. Running the Backend

From the repository root (`c:\Users\harsh\MiniCert`):

```powershell
.\venv\Scripts\uvicorn.exe backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Interactive OpenAPI documentation is served automatically at:
- Swagger UI: `http://127.0.0.1:8000/docs`
- OpenAPI JSON: `http://127.0.0.1:8000/openapi.json`

The Streamlit dashboard continues to run independently via:

```powershell
.\venv\Scripts\streamlit.exe run dashboard/app.py
```

---

## 2. Architecture & Lifecycle

- **Lifespan Caching (`backend/main.py`):** Loads and caches `MiniCertNet` (`saved_model.pth`), extracts `MathematicalNetwork` (float64), loads the MNIST test split (`data/`, 10,000 samples), ensures `results/experiments/` exists, and executes idempotent `import_legacy_experiments()`.
- **No Verification Changes:** All verification calls delegate directly to `dashboard.services`, `verification.pipeline`, `verification.integration` (L4-only default `include_hidden_relu=False`), and `evaluation.experiment`.
- **Single-Worker Job Manager (`backend/jobs/manager.py`):**
  - Uses `ThreadPoolExecutor(max_workers=1)` so concurrent HTTP requests never trigger parallel SciPy HiGHS CPU contention that would distort experiment runtime benchmarks.
  - **Important Limitation:** Active/queued job state is stored in **process memory** for a single backend worker process. Active job progress state is lost if the backend restarts, while completed experiments remain persisted atomically under `results/experiments/experiment_<id>/`.
- **Read-Only Exports:** Export routes stream `samples.csv` and `summary.json` directly from disk and **never** call `ExperimentResult.save()`.

---

## 3. Endpoints

### 3.1 `GET /api/health`
Returns startup readiness and resource status (`200 OK` when ready, `503 Service Unavailable` with `startup_error` if initialization failed).

**Example Response (`200 OK`):**
```json
{
  "status": "ok",
  "model_loaded": true,
  "network_loaded": true,
  "dataset_loaded": true,
  "dataset_size": 10000,
  "experiments_dir_ready": true,
  "active_jobs": 0,
  "legacy_imported_count": 0,
  "startup_error": null
}
```

### 3.2 `GET /api/model/architecture`
Returns dynamically inspected architecture metadata from `inspect_model_architecture(model)` and `MathematicalNetwork`.

**Example Response (`200 OK`):**
```json
{
  "source_model": "MiniCertNet",
  "input_features": 784,
  "output_features": 10,
  "num_linear_layers": 3,
  "num_sequence_layers": 5,
  "total_trainable_parameters": 52650,
  "layers": [
    "Linear(784 -> 64)",
    "Linear(64 -> 32)",
    "Linear(32 -> 10)"
  ],
  "sequence": [
    {"position": 0, "type": "linear", "input_features": 784, "output_features": 64, "activation": null},
    {"position": 1, "type": "relu", "input_features": null, "output_features": null, "activation": "relu"},
    {"position": 2, "type": "linear", "input_features": 64, "output_features": 32, "activation": null},
    {"position": 3, "type": "relu", "input_features": null, "output_features": null, "activation": "relu"},
    {"position": 4, "type": "linear", "input_features": 32, "output_features": 10, "activation": null}
  ],
  "checkpoint": "C:\\Users\\harsh\\MiniCert\\saved_model.pth"
}
```
- **Errors:** `503` if startup failed.

### 3.3 `GET /api/overview`
Returns dynamic model architecture, MNIST dataset summary, read-only equivalence audit (`results/equivalence_seed39_n100_summary.json` if present), total persisted experiments count, and latest `"Completed"` experiment metadata.
- **Errors:** `503` if startup failed. If the equivalence file is missing or unparseable, returns `200` with `equivalence_audit.available = false` and an `error` note.

### 3.4 `GET /api/samples/{sample_index}`
Returns the 28×28 normalized image matrix, ground-truth label, nominal prediction, logits, and pixel min/max for MNIST test sample `sample_index`.
- **Errors:** `422` if `sample_index < 0` or `>= dataset_size`.

### 3.5 `POST /api/verification`
Runs baseline IBP (`run_baseline_verification`) and/or L4-only LP-refined verification (`run_refined_verification`) on one MNIST test sample.

**Request Body:**
```json
{
  "sample_index": 0,
  "epsilon": 0.01,
  "mode": "both"
}
```
`mode` accepts `"baseline"`, `"refined"`, or `"both"` (default `"both"`).

**Example Response (`200 OK`):**
```json
{
  "sample_index": 0,
  "epsilon": 0.01,
  "label": 7,
  "predicted": 7,
  "target_class": 7,
  "mode": "both",
  "logits": [-4.12, "..."],
  "baseline": {
    "status": "INCONCLUSIVE",
    "margin": -11.42,
    "time_seconds": 0.00031,
    "lower": ["..."],
    "upper": ["..."],
    "error": null
  },
  "refined": {
    "status": "CERTIFIED",
    "margin": 2.41,
    "time_seconds": 1.42,
    "lp_refinement_time_seconds": 1.41,
    "refinement_status": "TIGHTENED",
    "refinement_targets": 10,
    "refinement_accepted": 10,
    "refinement_rejected": 0,
    "lower": ["..."],
    "upper": ["..."],
    "error": null
  },
  "per_class_bounds": [
    {
      "class_index": 0,
      "is_target": false,
      "baseline_lower": -5.1,
      "baseline_upper": 4.2,
      "baseline_width": 9.3,
      "refined_lower": -2.0,
      "refined_upper": -0.4,
      "refined_width": 1.6,
      "width_tightening_pct": 82.79
    }
  ]
}
```
- **Errors:** `422` for out-of-range `sample_index` or invalid/negative/non-finite/boolean `epsilon`. Solver/runtime errors inside a verification stage return `200` with `status: "ERROR"` and `error` populated, preserving missing metrics as `null`.

### 3.6 `POST /api/experiments`
Validates parameters and immediately queues a background evaluation experiment in `ThreadPoolExecutor(max_workers=1)`.

**Request Body:**
```json
{
  "experiment_type": "configured",
  "sample_count": 20,
  "epsilons": [0.01, 0.03, 0.05, 0.1],
  "seed": 42,
  "experiment_name": ""
}
```
- `epsilons` accepts either `list[float]` or comma-separated `str` (parsed with `dashboard.components.parse_epsilon_input`).
- `experiment_type: "development"` defaults to `sample_count=5`, `epsilons=[0.03]`, `seed=42` when omitted.

**Response (`202 Accepted`):**
```json
{
  "experiment_id": "20261128_002500_a1b2c3",
  "status": "QUEUED",
  "experiment_type": "configured",
  "sample_count": 20,
  "epsilons": [0.01, 0.03, 0.05, 0.1],
  "seed": 42,
  "total_pairs": 80,
  "estimated_lp_solves": 1600,
  "created_at": "2026-11-28T00:25:00+00:00"
}
```
- **Errors:** `422` if `sample_count < 1` or `> dataset_size`, `seed < 0` or `> 2^31 - 1`, or `epsilons` invalid/empty/negative.

### 3.7 `GET /api/experiments/{experiment_id}/status`
Polling fallback returning live job status (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`) from memory, or synthesized terminal status if the experiment exists on disk.
- **Errors:** `404` if `experiment_id` is unknown in both memory and storage.

### 3.8 `GET /api/experiments/{experiment_id}/events`
Server-Sent Events (`text/event-stream`) endpoint pushing real-time progress snapshots.
- Event names: `status` (initial snapshot), `progress`, `completed`, `failed`.
- Emits `: keepalive\n\n` every `0.5s` when idle and unsubscribes automatically if the client disconnects.
- **Errors:** `404` if `experiment_id` is unknown in both memory and storage.

### 3.9 `GET /api/experiments/{experiment_id}/results`
Read-only endpoint returning `metadata`, `config`, `model`, `dataset`, `sample_selection`, `metrics`, `charts` (`certification_rates`, `interval_widths`, `runtime`, `improvement`), and `records` (`SampleRecordDTO` list).
- **Errors:** `404` if not found; `409 Conflict` if experiment status is `Incomplete` or `Corrupted`; `422` if persisted files fail validation.

### 3.10 `GET /api/history` and `POST /api/history/refresh`
- `GET /api/history`: Lists all persisted experiments from `results/experiments/` sorted newest-first (`{ experiments, total }`).
- `POST /api/history/refresh`: Runs idempotent `import_legacy_experiments()` and returns `{ imported_count, imported, experiments }`.

### 3.11 `GET /api/history/{experiment_id}`
Returns `HistoryDetailResponse` (`{ metadata, loadable, config, model, dataset, sample_selection, metrics, charts, records }`). For `Incomplete` or `Corrupted` experiments, returns `200` with `loadable: false` and `metadata.error_message` populated.
- **Errors:** `404` if experiment folder does not exist.

### 3.12 `POST /api/comparison`
Compares 2 or more `"Completed"` experiments across matching $\varepsilon$ values via `dashboard.comparison`.

**Request Body:**
```json
{
  "experiment_ids": ["conf_seed42_n20", "evaluation_seed39_n100"]
}
```
- **Errors:** `422` if fewer than 2 distinct IDs are provided or any selected experiment is not `"Completed"`; `404` if any ID is missing.

### 3.13 `GET /api/exports/{experiment_id}/csv` and `GET /api/exports/{experiment_id}/json`
Strictly read-only file downloads streaming `samples.csv` (`text/csv`, `{experiment_id}_samples.csv`) and `summary.json` (`application/json`, `{experiment_id}_summary.json`) from disk.
- **Errors:** `422` on invalid/path-traversal `experiment_id`; `404` if the experiment or artifact file is missing.

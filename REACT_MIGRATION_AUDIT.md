# MiniCert — React Migration: Phase 1 Repository Audit

**Audit Date:** 2026-11-28  
**Repository Root:** `c:\Users\harsh\MiniCert`  
**Verified Python Environment:** Python `3.11.15` (`venv/`), PyTorch `2.15.0`, TorchVision `0.29.2`, NumPy `2.4.6`, SciPy `1.17.1`, Pandas `3.1.0`, Matplotlib `3.11.2`, Streamlit `1.66.1`, Pytest `9.2.0`  
**Verified Regression Baseline:** **686 passed in 21.79s** (`.\venv\Scripts\python.exe -m pytest -p no:cacheprovider tests/ -q`, working tree clean)

---

## 1. Executive Summary

MiniCert is a formal neural network local robustness verification research framework combining **Interval Bound Propagation (IBP)** with **Linear Programming (LP) bound refinement** (Planet/triangle ReLU relaxation solved via SciPy HiGHS) over $L_\infty$ input perturbation regions on MNIST.

The codebase already has a remarkably clean separation between its mathematical verification core and its UI layer:
- **Zero verification or evaluation modules import `streamlit`.** Only `dashboard/app.py` (1,975 lines) imports `streamlit`.
- The `dashboard/` package already isolates pure data transforms (`dashboard/components.py`), multi-experiment comparability logic (`dashboard/comparison.py`), service orchestration (`dashboard/services.py`), persistent disk storage (`dashboard/storage.py`), and Matplotlib chart builders (`dashboard/visualizations.py`) from Streamlit.
- Because the core engine (`models/`, `abstract_domain/`, `verification/`, `evaluation/`) and helper modules are pure Python, migrating to a **React + TypeScript + Vite** frontend backed by a **FastAPI** API layer can be executed **in parallel** with the existing Streamlit dashboard without moving existing core packages or altering verification math.

However, the audit identified several important architectural defects and migration requirements:
1. **UI/Research Drift in Streamlit Sidebar:** `dashboard/app.py` hardcodes `MiniCertNet` as `784 -> 100 -> 50 -> 10 · 4 Layers` (lines 1900–1903), whereas the actual `models/network.py` `MiniCertNet` architecture is `784 -> 64 -> 32 -> 10` (3 `Linear` + 2 `ReLU` = 5 layers in `MathematicalNetwork.layers`). The API should serve `inspect_model_architecture()` dynamically instead.
2. **Read-Path Disk Side-Effect on Results Export:** `render_results_section()` in `dashboard/app.py` (line 1448) unconditionally invokes `result.save()` on every render just to read bytes for `st.download_button`, silently writing flat `*_samples.csv` / `*_summary.json` files into `result.config.output_dir` even when inspecting historical runs. FastAPI exports must be purely read-only.
3. **Synchronous Long-Running Benchmark Execution:** `execute_and_save_experiment()` blocks synchronously inside `st.spinner(...)` with no per-sample/per-epsilon progress callback (`run_experiment()` in `evaluation/experiment.py` lacks a progress hook). Moving to FastAPI requires an async background job runner with progress reporting (SSE + polling fallback).
4. **In-Memory vs. Persistent State Split:** Streamlit relies on `st.session_state` (`baseline_cache`, `refined_cache`, `experiment_result`, `current_experiment_id`, `workspace_nav`) and `st.cache_resource` (`cached_network`, `cached_dataset`). In FastAPI + React, resource caching belongs to FastAPI lifespan state, active selection belongs to React/URL state, and completed experiments live in `results/experiments/`.

---

## 2. Existing Repository Architecture

### 2.1 Package & Directory Inventory

| Path | Purpose | Key Modules / Files | Dependencies |
| :--- | :--- | :--- | :--- |
| `models/` | PyTorch architectures, training CLI, safe checkpoint loading, float64 network extraction | `network.py` (`MiniCertNet`, `FCNet`), `model_loader.py` (`load_model`, `save_model`, `extract_network`, `MathematicalNetwork`, `LinearLayer`, `ReLULayer`, `inspect_model_architecture`), `train.py`, `train_mnist.py` | `torch`, `torchvision`, `numpy` |
| `abstract_domain/` | Abstract interpretation domains and IBP propagation | `interval.py` (`Interval`), `box.py` (`Box`), `bounds.py` (`LayerBounds`, `IntermediateBounds`, `NeuronRef`, `RefinedBounds`), `propagation.py` (`propagate_network`, `get_intermediate_bounds`), `refinement.py` (`propagate_with_refinements`) | `numpy`, `verification.regions.BoxProtocol`, `models.model_loader` |
| `verification/` | $L_\infty$ regions, safety check, Planet LP builder, HiGHS solver, bound refinement, integrated pipeline | `regions.py` (`InputRegion`, `BoxProtocol`), `safety.py` (`SafetyChecker`), `__init__.py` (`VerificationStatus`, `VerificationResult`), `lp.py` (`build_lp_problem`, `LPProblem`, `VariableLayout`), `lp_solver.py` (`solve_lp`, `LPSolverResult`), `refinement.py` (`refine_neuron_bounds`, `RefinementResult`), `integration.py` (`verify_robustness_refined`, `select_refinement_targets`), `pipeline.py` (`verify_robustness`), `refinement_validation.py` | `numpy`, `scipy.optimize.linprog` (HiGHS), `abstract_domain`, `models.model_loader` |
| `evaluation/` | Batch evaluation engine, MNIST dataset loader, metrics aggregation, CSV/JSON exports, L4 vs all-target equivalence study | `dataset.py` (`load_mnist_test_dataset`, `select_samples`, `InputSample`, `SampleSelection`, `flatten_image`), `runner.py` (`evaluate_sample`), `metrics.py` (`SampleRecord`, `CertificationMetrics`, `BoundTighteningMetrics`, `RuntimeMetrics`, `EpsilonMetrics`), `experiment.py` (`ExperimentConfig`, `ExperimentResult`, `run_experiment`, `load_trained_network`), `exports.py` (`write_samples_csv`, `write_summary_json`), `equivalence.py` (`EquivalenceConfig`, `EquivalencePairRecord`, `run_equivalence_validation`), `__main__.py` | `torchvision`, `numpy`, `models`, `abstract_domain`, `verification` |
| `dashboard/` | Streamlit UI + decoupled dashboard helpers, storage, comparison, charts | `app.py` (Streamlit UI), `services.py` (`IndividualOutcome`, `run_baseline_verification`, `run_refined_verification`, `predict_image`, `execute_and_save_experiment`), `storage.py` (`ExperimentMetadata`, `save_experiment`, `list_experiments`, `load_experiment_data`, `load_experiment_result`, `import_legacy_experiments`), `components.py`, `comparison.py`, `visualizations.py` | `streamlit` (`app.py` only), `pandas`, `matplotlib`, `numpy`, `evaluation`, `verification`, `abstract_domain`, `models` |
| `refinement/` | Placeholder package (BaB planned; docstring only) | `__init__.py` (`__all__ = []`) | None |
| `experiments/` | Placeholder package (docstring only) | `__init__.py` (`__all__ = []`) | None |
| `data/` | Local MNIST dataset binary/gz files (`data/MNIST/raw/*`) | `t10k-images-idx3-ubyte*`, `t10k-labels-idx1-ubyte*`, `train-*` | Consumed by `torchvision.datasets.MNIST` |
| `results/` | Persisted evaluation & equivalence artifacts | Flat files (`evaluation_seed39_n100_*`, `evaluation_seed42_n20_*`, `evaluation_seed42_n5_*`, `equivalence_seed39_n100_*`, `smoke_n3*`) and `results/experiments/experiment_<id>/` (`config.json`, `summary.json`, `samples.csv`) | Read/written by `evaluation.exports` & `dashboard.storage` |
| `tests/` | 21 pytest test files (686 tests total) | `test_dashboard.py`, `test_lp.py`, `test_lp_solver.py`, `test_integration.py`, `test_equivalence_validation.py`, `test_evaluation_pipeline.py`, etc. | `pytest`, all core packages |
| Root config & assets | Dependencies, Streamlit theme, trained weights, docs | `requirements.txt`, `.streamlit/config.toml`, `.gitignore`, `saved_model.pth` (213,701 bytes), `README.md`, `docs/*` | — |

### 2.2 Dependency & Configuration Files

- **`requirements.txt`:** Uses minimum version specifiers (`>=`): `torch>=2.2.0`, `torchvision>=0.17.0`, `numpy>=1.24.0`, `scipy>=1.11.0`, `matplotlib>=3.8.0`, `streamlit>=1.30.0`, `pytest>=7.4.0`. Note: `pandas` is imported in `dashboard/app.py` (line 15) and installed in `venv` (`3.1.0`), though not explicitly listed in `requirements.txt`. `starlette` and `uvicorn` are present in `venv` as Streamlit/transitive or prior packages, while `fastapi` and `pydantic` are **not** yet installed.
- **`.streamlit/config.toml`:** Configures the warm research palette (`primaryColor = "#702B3A"`, `backgroundColor = "#F7F3ED"`, `secondaryBackgroundColor = "#F1EAE2"`, `textColor = "#51494A"`), headless server, XSRF protection enabled, CORS disabled.
- **`saved_model.pth`:** Reference `MiniCertNet` checkpoint (`784 -> 64 -> 32 -> 10`, ReLU activations, 52,650 trainable parameters, 96.44% MNIST test accuracy per `docs/training_report.md`). Loaded via `load_trained_network(CHECKPOINT_PATH)` using `strict=True` and `weights_only=True` when supported, then extracted to float64 `MathematicalNetwork`.

### 2.3 Experiment Storage & Export Formats

1. **Flat Evaluation & Equivalence Artifacts (`results/`):**
   - `ExperimentResult.save()` writes `<experiment_name>_samples.csv` (22 columns defined in `SampleRecord.CSV_FIELDNAMES`) and `<experiment_name>_summary.json` (`experiment_name`, `config`, `model`, `dataset`, `sample_selection`, `results` list of `EpsilonMetrics`).
   - `equivalence_seed39_n100_summary.json` and `equivalence_seed39_n100_samples.csv` (37 columns in `EquivalencePairRecord.CSV_FIELDNAMES`) store the separate L4-only vs. all-target equivalence study (`seed=39`, `n=100`, `epsilons=[0.01, 0.03, 0.05, 0.1]`, `tolerance=1e-12`).
2. **Structured Experiment Folders (`results/experiments/experiment_<id>/`):**
   - Managed atomically (write to `.tmp_<folder>_<salt>` then `os.replace`) by `dashboard/storage.py`.
   - Contains `config.json` (adds `experiment_id`, `experiment_type`, `timestamp`, `status`), `summary.json` (`ExperimentResult.to_dict()` + the 4 metadata keys), and `samples.csv` (`SampleRecord.CSV_FIELDNAMES`).
   - Existing folders on disk:
     - `experiment_conf_seed42_n20` (`experiment_id="conf_seed42_n20"`, `configured`, `n=20`, `seed=42`, `epsilons=[0.01, 0.03, 0.05, 0.1]`)
     - `experiment_dev_seed42_n5` (`experiment_id="dev_seed42_n5"`, `development`, `n=5`, `seed=42`, `epsilons=[0.03]`)
     - `experiment_evaluation_seed39_n100` (`experiment_id="evaluation_seed39_n100"`, `configured`, `n=100`, `seed=39`, `epsilons=[0.01, 0.03, 0.05, 0.1]`)
   - `import_legacy_experiments()` runs on Streamlit startup and on "Refresh History": maps `evaluation_seed42_n5 -> dev_seed42_n5`, `evaluation_seed42_n20 -> conf_seed42_n20`, and dynamically imports complete `evaluation_*_summary.json` + `_samples.csv` pairs. It intentionally ignores `smoke_n3*` and `equivalence_*`.
3. **JSON/CSV Integrity Rules:**
   - `write_summary_json()` uses `allow_nan=False` so non-finite floats fail loudly.
   - `SampleRecord.to_row()` serializes `None` as `""` and `from_row()` restores `""` back to `None` (never `0`).

---

## 3. Streamlit Dashboard Feature Inventory

### 3.1 Global Shell & Startup Behavior (`dashboard/app.py`)
- **Theme & Layout:** Wide layout (`st.set_page_config`), custom CSS (`apply_research_theme`) using `DM Serif Display`, `Inter`, and `JetBrains Mono`, warm off-white background (`#F7F3ED`), panel (`#FFFCF8`), wine primary (`#702B3A`).
- **Startup Initialization (`main()`):**
  - Checks `CHECKPOINT_PATH.is_file()` (`saved_model.pth`); calls `st.error` + `st.stop()` if missing.
  - Loads & caches `cached_network(CHECKPOINT_PATH)` and `cached_dataset(DATA_DIR)` via `@st.cache_resource`; stops with error if either fails.
  - Calls `import_legacy_experiments()` silently (`try/except pass`).
  - Auto-populates `st.session_state["experiment_result"]`, `current_experiment_id`, and `current_experiment_metadata` with the newest `"Completed"` experiment if `experiment_result` is `None`.
- **Sidebar Drawer:**
  - Brand header ("FORMAL METHODS RESEARCH / MiniCert / Neural Network Robustness Verifier").
  - Verified Network card (currently displays hardcoded `MiniCertNet`, `{network.input_features} -> 100 -> 50 -> {network.output_features} · 4 Layers`, tags `PyTorch`, `Float64`, `HiGHS LP` — **bug noted in §1 & §4**).
  - Active Benchmark Run card (`st.session_state.get("current_experiment_id", "None loaded")`).
  - Radio navigation across 6 views: `Overview`, `Individual Verification`, `New Experiment`, `Experiment Results`, `Experiment History`, `Experiment Comparison`.

### 3.2 Shared Components & Visualization Functions
- **`status_badge(status)` (`dashboard/app.py:519`):** Uses `dashboard.components.status_display()` and renders colored pill badges for `CERTIFIED`, `INCONCLUSIVE`, `ERROR`, `COMPLETED`, `FAILED`, `INCOMPLETE`, `CORRUPTED`, `TIGHTENED`, `UNCHANGED`, fallback `UNKNOWN` / `NOT RUN`.
- **`render_bounds_table(...)` (`dashboard/app.py:544`):** Renders a class-by-class logit table (`Class` with `★ (Target)` marker, `Lower Bound`, `Upper Bound`, `Interval Width` formatted `:.4f`). When `comp_lower`/`comp_upper` are provided, adds `Refined Lower`, `Refined Upper`, `Refined Width`, `Width Tightening (%)` (`(base_w - ref_w)/base_w * 100` formatted `:+.1f%`, `0.0%` if `base_w <= 0`).
- **`render_chart_panel(figure, data, *, key, title, explanation, unit)` (`dashboard/app.py:588`):**
  - Card header with title + optional `(unit)` and explanation.
  - Control toolbar: `Show Legend` checkbox (default `True`), `Show Grid` checkbox (default `True`), `Download PNG` button (`dpi=200`, `bbox_inches="tight"`, `facecolor="#FFFCF8"`, filename `{key}.png`).
  - Bordered Matplotlib figure (`st.pyplot`).
  - Collapsible expander `"Accessible Numerical Data & CSV Export"` containing `st.dataframe(frame)` and `"Download Chart Data (CSV)"` (`{key}_data.csv`).
- **`dashboard/visualizations.py`:** 4 single-experiment plots (`plot_certification_rates`, `plot_interval_widths`, `plot_runtime` [auto log scale if `max/min >= 100` and all > 0], `plot_improvement`) and 4 multi-experiment comparison plots (`plot_comparison_certification`, `plot_comparison_widths`, `plot_comparison_runtime`, `plot_comparison_improvement`). Missing/non-finite points render as `"n/a"`, never `0`.

### 3.3 Page-by-Page Functional Audit

#### Page 1: Overview (`render_overview_section`, `app.py:670–946`)
- **What the user sees:** Research identity hero banner; "The Research Problem" prose with inline LaTeX; "Proposed Verification Methodology" 6-step grid (`01 · INPUT REGION` through `06 · VERDICT`); "Formal Certification Condition" LaTeX equation ($L_t > \max_{j \neq t} U_j$) + margin definition + scientific clarification callout (`INCONCLUSIVE` ≠ unsafe/counterexample); "Implemented Technical Architecture" 4-card grid (`MathematicalNetwork`, `Interval Arithmetic`, `Planet ReLU Relaxation`, `SciPy HiGHS Optimizer`); "Research Scope & Boundary Limitations" two-column cards; "Empirical Experimental Evidence" section with 4 KPI cards + audit summary card + scope note caption.
- **Actions / Inputs:** Read-only informational view; no user inputs or actions.
- **Python calls:** Reads `results/equivalence_seed39_n100_summary.json` directly via `Path.read_text()` + `json.loads()`; computes `solves_ratio = overall["mode_a_total_lp_solves"] / overall["mode_b_total_lp_solves"]`. (Receives `network` param, currently unused in body.)
- **Data displayed & origin:** Static research narrative + live metrics from `results/equivalence_seed39_n100_summary.json`: `Evaluated Samples` (`100`, `Seed 39`), `Total Paired Queries` (`400`, `4 Perturbation Radii`), `Verdict Discrepancies` (`0 / 400`, `Exact Equivalence`), `Mean Runtime Speedup` (`6.54×`, `Median 7.29×`), LP solves `44,686 -> 8,000` (`5.59× fewer LP solves`, up to `8.74×` at $\varepsilon=0.10$), bound identity `0.000e+00`.
- **Persistence / Exports:** None.
- **Loading / Error / Empty states:** If `equivalence_seed39_n100_summary.json` is absent -> `st.info(...)`; if JSON parsing fails -> `st.warning(...)`.

#### Page 2: Individual Verification (`render_individual_section`, `app.py:962–1175`)
- **What the user sees:** Section header; sample & $\varepsilon$ controls; 28×28 grayscale MNIST digit preview (`width=150`, caption `MNIST Test Digit #{sample_index}`); Classification Summary card (Ground Truth Label, Model Prediction, Target class, perturbation space formula, certification rule); two execution buttons; side-by-side Verification Outcomes cards (Baseline IBP & LP-Refined); Class-by-Class Output Logit Bounds table.
- **Actions & Inputs:**
  - `MNIST Test Sample Index`: integer `number_input` (`min=0`, `max=len(dataset)-1` [9999], `default=0`, `step=1`).
  - `Perturbation Radius ε`: float `slider` (`min=0.0`, `max=0.20`, `default=0.03`, `step=0.005`, format `"%.3f"`).
  - Button `"Run Baseline IBP Verification"` (secondary).
  - Button `"Run LP-Refined Verification"` (primary).
- **Python calls:**
  - `dataset[sample_index]` -> `evaluation.dataset.flatten_image(image_tensor)`
  - `dashboard.services.predict_image(network, vector)` (cached in `st.session_state[("pred", sample_index)]`)
  - `dashboard.services.run_baseline_verification(network, InputSample, epsilon)` -> calls `verify_robustness` + `propagate_network`
  - `dashboard.services.run_refined_verification(network, InputSample, epsilon)` -> calls `verify_robustness_refined`
  - `dashboard.components.status_display`, `dashboard.components.format_optional`, `render_bounds_table`
- **Data displayed & origin:**
  - Image & label from cached MNIST test dataset; prediction from `MathematicalNetwork.forward`.
  - Baseline card: Verdict badge, Margin (`format_optional`), Target class, IBP Time (`:.4fs` or `—`). Note: if only Refined was run, `res_col1` falls back to `refined_outcome` for baseline verdict/margin (with `IBP Time = "—"`).
  - Refined card: Verdict badge, Margin, LP Time (`:.3fs`), Total Time (`:.3fs`), LP Solves (`{accepted} / {targets}`).
  - Output Logit Bounds table: 10 rows (classes `0..9`, target starred). Shows 4 columns if only one method ran, or 8 comparison columns (`Lower Bound`, `Upper Bound`, `Interval Width`, `Refined Lower`, `Refined Upper`, `Refined Width`, `Width Tightening (%)`) when both ran for the same `(sample_index, epsilon)`.
- **Persistence / Exports:** Ephemeral `st.session_state` caches (`pred`, `baseline_cache`, `refined_cache`) keyed by `(sample_index, epsilon)`. Not persisted to disk; no CSV/JSON export.
- **Loading / Error / Empty states:**
  - `st.spinner("Computing Interval Bound Propagation...")` / `st.spinner("Solving LP relaxations via SciPy HiGHS...")`.
  - Empty: `st.info` prompts in Baseline and/or Refined columns before running.
  - Error: If `baseline_status == "ERROR"` or `refined_status == "ERROR"`, displays `st.error(...)` with formatted exception; metrics show `"—"`.

#### Page 3: New Experiment (`render_new_experiment_section`, `app.py:1182–1304`)
- **What the user sees:** Section header; "1. Benchmark Parameters" with caption noting correctly classified sampling + deterministic seeds; 3 parameter inputs; "2. Execution Design" with 2 action buttons.
- **Actions & Inputs:**
  - `Sample Count (correctly classified)`: integer `number_input` (`min=1`, `max=10000`, `default=20`, `step=5`).
  - `Perturbation Radii ε (comma-separated)`: `text_input` (`default="0.01, 0.03, 0.05, 0.1"`).
  - `Random Seed`: integer `number_input` (`min=0`, `max=2**31 - 1`, `default=42`, `step=1`).
  - Button `"Run Fast Development Run (5 samples, ε = 0.03)"` -> fixed `ExperimentConfig(sample_count=5, epsilons=(0.03,), seed=42)`, `experiment_type="development"`.
  - Button `"Run Configured Experiment"` (primary) -> parses `epsilon_text` via `parse_epsilon_input()`, constructs `ExperimentConfig(..., data_dir=DATA_DIR, checkpoint=CHECKPOINT_PATH)`, `experiment_type="configured"`.
- **Python calls:** `parse_epsilon_input`, `ExperimentConfig`, `execute_and_save_experiment` -> `run_experiment` + `storage.save_experiment`.
- **Data displayed & origin:** Warning banner when `sample_count * len(epsilons) >= 200` showing `{total_pairs} sample-epsilon pairs ({total_pairs * 20:,} LP solves)`. Upon completion: `st.success` with generated `experiment_id`.
- **Persistence / Exports:** Atomically persisted to `results/experiments/experiment_<id>/` (`config.json`, `summary.json`, `samples.csv`) and registered in `st.session_state` (`experiment_result`, `current_experiment_id`, `current_experiment_metadata`).
- **Loading / Error / Empty states:**
  - `st.spinner("Executing {experiment_type} verification experiment (this may take some time)...")` — **no incremental progress bar**.
  - Invalid config -> `st.error("Configuration error: ...")`.
  - Execution failure -> `st.error("Experiment execution failed: ...")`.

#### Page 4: Experiment Results (`render_results_section`, `app.py:1311–1472`)
- **What the user sees:** Section header; Active Experiment Identifier card (`experiment_id` or `experiment_name`, `experiment_type`, `selected_count` correctly classified, `incorrect_excluded`, count of $\varepsilon$ values, `seed`); "Aggregated Summary by Perturbation Radius" (per-$\varepsilon$ 4-metric row: `Baseline Certified` %, `Refined Certified` %, `Improvement Delta` `+.1f pp`, `Verification Errors` sum); "Publication Visualizations" (4 tabs: `Certification Rates`, `Interval Widths`, `Runtime Comparison`, `Certification Improvement`); "Per-Sample Verification Records" table (17 columns in `PER_SAMPLE_COLUMNS`); "Download Artifacts" (2 download buttons).
- **Actions & Exports:**
  - Switch between 4 chart tabs; toggle `Show Legend` / `Show Grid` per chart; download PNG (`{key}.png`) and chart CSV (`{key}_data.csv`) per chart; expand accessible data table.
  - `"Download Per-Sample Records (CSV)"` and `"Download Aggregated Summary (JSON)"`.
- **Python calls:** `certification_rate_series`, `width_series`, `runtime_series`, `improvement_series`, `plot_*`, `render_chart_panel`, `records_table_rows`, **`result.save()`** (called on render to obtain export paths).
- **Data origin:** `st.session_state["experiment_result"]` (populated by New Experiment, History "Load into Active Results View", or startup auto-load of latest Completed experiment).
- **Persistence:** **Side-effect:** `result.save()` writes `{experiment_name}_samples.csv` and `{experiment_name}_summary.json` into `result.config.output_dir` during render.
- **Loading / Error / Empty states:**
  - Empty: `st.info("No experiment loaded or executed yet...")` if `experiment_result is None`.
  - Error: `st.error(f"Failed to export files: {exc}")` if `result.save()` fails. Missing rates/deltas display as `"—"`.

#### Page 5: Experiment History (`render_history_section`, `app.py:1479–1676`)
- **What the user sees:** Section header + `"🔄 Refresh History"` button; Summary Table (`HISTORY_TABLE_COLUMNS`: `Experiment ID`, `Type`, `Date`, `Samples`, `Epsilon values`, `Seed`, `Status`); `"Inspect Stored Experiment"` selectbox; Experiment Status badge + optional error warning; `"Load into Active Results View"` button; collapsible `"Stored Configuration JSON"`; `"Aggregated Metrics by Epsilon"` (4 metrics per $\varepsilon$: Baseline Rate, Refined Rate, Improvement, Inconclusive `base / ref`); collapsible `"Historical Per-Sample Records Table"`; `"Historical Visualizations"` (same 4 tabs & `render_chart_panel` exports as Results); `"Download Historical Files"` (`samples.csv`, `summary.json`).
- **Actions & Inputs:**
  - Click `"🔄 Refresh History"` -> calls `import_legacy_experiments()`, shows count imported or "up to date", reruns.
  - Select experiment via `st.selectbox` (defaults to index 0, newest first).
  - Click `"Load into Active Results View"` -> sets `st.session_state` active experiment + sets `workspace_nav = "Experiment Results"` + reruns.
  - Toggle JSON/table expanders, chart controls, and download `{selected_id}_samples.csv`, `{selected_id}_summary.json`, chart PNGs, and chart CSVs.
- **Python calls:** `import_legacy_experiments`, `list_experiments`, `history_table_rows`, `load_experiment_result`, `records_table_rows`, `*_series`, `plot_*`, `render_chart_panel`.
- **Data origin:** Disk scan of `results/experiments/experiment_*` (read-only, no re-verification).
- **Persistence / Exports:** Legacy import persists newly discovered `results/evaluation_*` runs into `results/experiments/`. Downloads read `exp_dir / "samples.csv"` and `exp_dir / "summary.json"` directly without re-saving.
- **Loading / Error / Empty states:**
  - Empty repository: `st.info("No experiment records found in persistent storage.")`.
  - `Incomplete` or `Corrupted` experiment selected: shows status badge, optional `st.warning(error_message)`, and `st.info("This experiment is incomplete or corrupted and cannot be fully loaded.")` (stops detail view).
  - `load_experiment_result` failure -> `st.error(...)`.

#### Page 6: Experiment Comparison (`render_comparison_section`, `app.py:1683–1823`)
- **What the user sees:** Section header; multiselect of `Completed` experiments (defaults to first 2 newest); `"Comparability Analysis & Validation Notices"` (warning/info banners); `"Matching perturbation radii compared"`; `"10-Metric Side-by-Side Comparison Table"` (single table if 1 matching $\varepsilon$, or `st.tabs` per matching $\varepsilon$); `"Comparative Publication Charts"` (4 stacked `render_chart_panel` charts: Refined Certification Rate, Certification Improvement, Mean Refined Output Interval Width, Total Refined Verification Runtime).
- **Actions & Inputs:**
  - `st.multiselect` choosing $\ge 2$ completed experiments.
  - Switch $\varepsilon$ tabs for the 10-metric table; toggle legend/grid and download PNG/CSV on all 4 comparison charts.
- **Python calls:** `list_experiments`, `load_experiment_result`, `ComparisonItem`, `build_comparison_analysis`, `build_comparison_metric_table`, `get_comparison_series_for_plotting`, `plot_comparison_certification`, `plot_comparison_improvement`, `plot_comparison_widths`, `plot_comparison_runtime`, `render_chart_panel`.
- **Data origin:** Loaded from disk for selected `"Completed"` experiments; never combines experiments into one record.
- **Persistence / Exports:** Read-only; supports PNG & CSV chart exports via `render_chart_panel` (note: comparison chart CSV data uses `pd.json_normalize(comp_series["experiments"])`).
- **Loading / Error / Empty states:**
  - `< 2` completed experiments on disk -> `st.info(...)`.
  - `< 2` selected in multiselect -> `st.warning("Please select at least two experiments to compare.")`.
  - Load error -> `st.error(...)`.
  - No common $\varepsilon$ across selected runs -> `st.error("No common perturbation radii (ε) found...")` and stops before table/charts.

---

## 4. Python Dependency & Coupling Analysis

### 4.1 Classification of Existing Modules

| Category | Modules | Notes |
| :--- | :--- | :--- |
| **A. Pure Mathematical / Verification Logic** | `models/network.py`, `models/model_loader.py`, `models/train.py`, `models/train_mnist.py`, `abstract_domain/interval.py`, `abstract_domain/box.py`, `abstract_domain/bounds.py`, `abstract_domain/propagation.py`, `abstract_domain/refinement.py`, `verification/__init__.py`, `verification/regions.py`, `verification/safety.py`, `verification/lp.py`, `verification/lp_solver.py`, `verification/refinement.py`, `verification/integration.py`, `verification/pipeline.py`, `verification/refinement_validation.py` | **100% Streamlit-free.** Only depends on Python stdlib, NumPy, SciPy, PyTorch. Must remain untouched during migration. |
| **B. Reusable Application & Evaluation Services** | `evaluation/dataset.py`, `evaluation/runner.py`, `evaluation/metrics.py`, `evaluation/experiment.py`, `evaluation/equivalence.py`, `evaluation/__main__.py`, `dashboard/services.py`, `dashboard/components.py`, `dashboard/comparison.py` | **100% Streamlit-free.** `dashboard/services.py` orchestrates individual verification and experiment execution; `dashboard/components.py` converts `ExperimentResult`/`ExperimentMetadata` into chart series & display rows; `dashboard/comparison.py` handles comparability rules and 10-metric comparison tables. |
| **C. Streamlit-Specific Presentation & Interaction Logic** | `dashboard/app.py`, `.streamlit/config.toml` | Only file importing `streamlit`. Owns `st.session_state`, `@st.cache_resource`, CSS injection, widgets, Matplotlib rendering (`st.pyplot`), and `st.download_button`. `dashboard/visualizations.py` is Streamlit-free Matplotlib rendering tied to PNG generation (useful for Streamlit and optional server-side PNG export if desired, though React will render interactive charts via Recharts). |
| **D. Persistence & Export Functionality** | `evaluation/exports.py`, `dashboard/storage.py` | **100% Streamlit-free.** Handles atomic experiment directory creation (`config.json`, `summary.json`, `samples.csv`), listing/status validation, faithful reconstruction (`load_experiment_result`), and idempotent legacy import (`import_legacy_experiments`). |

### 4.2 Coupling Findings & Architectural Problems

1. **No mathematical module depends on Streamlit**, verified by repository-wide search (`Select-String` for `streamlit` across all `.py` files only matched `dashboard/app.py`, docstrings in `dashboard/__init__.py`, `verification/__init__.py`, and comments in `dashboard/*.py` / `tests/test_dashboard.py`).
2. **Namespace Ownership (`dashboard/`):** Reusable non-Streamlit modules (`services.py`, `storage.py`, `components.py`, `comparison.py`) live inside the `dashboard/` package. Moving them right now would break `tests/test_dashboard.py` and `dashboard/app.py`. Instead, the new `backend/` API layer can import them directly (or wrap them via thin adapter services) while keeping `dashboard/` intact.
3. **Read-Path Disk Write in `render_results_section()` (`dashboard/app.py:1448`):** Calling `result.save()` inside the UI render loop mutates disk when viewing results. In FastAPI, artifact downloads must stream existing files from `results/experiments/<folder>/` or serialize in memory (`csv.DictWriter` into `io.StringIO` / `json.dumps`).
4. **Hardcoded Incorrect Architecture String (`dashboard/app.py:1900–1903`):** Sidebar renders `784 -> 100 -> 50 -> 10 · 4 Layers` instead of inspecting `network` (`784 -> 64 -> 32 -> 10`, 5 layers in `MathematicalNetwork.layers`, 3 linear layers).
5. **Missing Progress Hook in `evaluation/experiment.py`:** `run_experiment()` runs a nested loop (`for epsilon in config.epsilons: for sample in selection.samples: evaluate_sample(...)`) without yielding or invoking a callback. For FastAPI background progress reporting without modifying `run_experiment()`'s default behavior/signature, either an optional `progress_callback: Optional[Callable[[int, int, float, int], None]] = None` keyword parameter can be added cleanly in Phase 2 (backwards-compatible) or the backend job wrapper can iterate `select_samples` -> `evaluate_sample` -> `aggregate_epsilon_metrics` using the exact same public functions. (Adding an optional keyword-only `progress_callback=None` to `run_experiment()` is cleaner and avoids duplicating loop logic.)
6. **`IndividualOutcome` NumPy Arrays & `SampleSelection` Empty Images:** `IndividualOutcome` holds `np.ndarray` (`baseline_lower`, `refined_lower`, etc.), and `load_experiment_result()` populates `InputSample.image = np.empty(0)`. FastAPI Pydantic response schemas must serialize arrays to `list[float]` and never rely on `image` from historical `ExperimentResult`.
7. **Coupled `pandas` Dependency:** `dashboard/app.py` imports `pandas` (missing from `requirements.txt`). FastAPI + React does not need `pandas` at all.

---

## 5. Backend Separation Recommendations

To preserve 100% behavioral parity and keep Streamlit + all 686 tests working untouched:
1. **Keep `models/`, `abstract_domain/`, `verification/`, `evaluation/`, and `dashboard/` in place.** Do not move or rename existing packages during parallel migration.
2. **Add a thin `backend/` FastAPI package** that:
   - Imports `models.model_loader.inspect_model_architecture`, `evaluation.load_trained_network`, `evaluation.load_mnist_test_dataset`, `evaluation.dataset.flatten_image`, `dashboard.services.*`, `dashboard.storage.*`, `dashboard.components.*`, `dashboard.comparison.*` directly.
   - Owns **only** HTTP/SSE transport, Pydantic request/response schemas, resource lifespan caching (network + dataset + startup `import_legacy_experiments()`), in-memory background experiment job state, and read-only CSV/JSON streaming.
   - Never duplicates verification math, safety checking, LP formulation, metric aggregation, or comparability checks.
3. **Avoid disk mutation on read:** For downloading CSV/JSON of a stored experiment, read `samples.csv` and `summary.json` directly from the experiment directory (`ExperimentMetadata.path`), or serialize `ExperimentResult` in memory if an in-memory-only result is ever exported.
4. **Add an optional `progress_callback` hook (Phase 2) only if needed, keeping default signature identical:** If `run_experiment(..., progress_callback=None)` is extended, verify all existing `evaluation` and `dashboard` tests remain 100% unchanged and passing.

---

## 6. Proposed FastAPI Architecture

### 6.1 Stack
- **Backend Framework:** FastAPI + Pydantic v2 + Uvicorn (ASGI).
- **Compute / Core Engine:** Existing Python 3.11, PyTorch, TorchVision, NumPy, SciPy (HiGHS) stack.
- **No Heavy Infrastructure Needed:** Do **not** introduce Redis, Celery, or PostgreSQL. MiniCert is a single-node local/research workstation application with file-based atomic persistence (`results/experiments/`) and 10,000 MNIST test images in memory (~60 MB).

### 6.2 Application Lifespan & Resource Caching
- On FastAPI startup (`lifespan`), mirror `dashboard/app.py` startup:
  1. Load & cache `MathematicalNetwork` from `saved_model.pth` via `load_trained_network()`.
  2. Load & cache MNIST test dataset via `load_mnist_test_dataset(DATA_DIR)` (and optionally precompute or lazy-cache nominal predictions/images).
  3. Run `import_legacy_experiments()` safely.
  4. Initialize an in-memory `JobRegistry` + bounded `ThreadPoolExecutor(max_workers=1)` for background experiments (using `max_workers=1` prevents CPU/HiGHS thread contention from skewing experiment wall-clock runtime measurements!).

### 6.3 React ↔ FastAPI Communication & Progress Reporting
- **Synchronous REST JSON:** Used for Overview metadata, MNIST sample preview/prediction, Individual Verification (Baseline IBP takes ~0.3ms; LP-refined takes ~1–12s on `MiniCertNet`), History listing/inspection, Comparison analysis, and CSV/JSON artifact downloads.
- **Background Execution + Server-Sent Events (SSE) with Polling Fallback:**
  - **Why needed:** `New Experiment` runs can take seconds (`dev`: ~5–12s) to many minutes (`n=100`, 4 $\varepsilon$s: ~7–12 minutes for 400 sample-epsilon pairs / ~8,000 LP solves).
  - **Recommendation: SSE (`text/event-stream`) as primary + REST `GET /api/experiments/jobs/{job_id}` for polling/reconnection.**
    - SSE is native HTTP, unidirectional (server → client), requires zero WebSocket boilerplate or broker infrastructure, works cleanly with Vite proxy and browser `EventSource` (or `fetch` stream), and pushes real-time progress (`stage`: `selecting_samples` | `evaluating` | `saving` | `completed` | `failed`, `completed_pairs`, `total_pairs`, `current_epsilon`, `current_sample_index`, `elapsed_seconds`, `experiment_id`).
    - Keeping the REST job status endpoint alongside SSE allows graceful recovery if the user navigates away, refreshes the browser, or loses the stream connection.
  - **Single-worker execution queue:** SciPy HiGHS solves are CPU-bound; serializing background experiment jobs (`max_workers=1`) guarantees accurate runtime measurements comparable to existing benchmarks.

---

## 7. Proposed API Endpoint Map

> **Convention:** Fields marked `[confirm in Phase 2]` depend on final serialization decisions (e.g., whether MNIST sample image is returned as a 28×28 normalized matrix, base64 PNG, or both; and whether chart PNG export stays client-side SVG/Canvas or also has an optional server endpoint).

### 7.1 Overview & System Metadata

| Method | Route | Purpose | Request Fields | Response Fields | Reused Python Functionality | Error Cases |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/overview` | Return verified network architecture metadata, capability/limitation metadata (optional or static in React), and live equivalence audit summary | None | `model`: `{ source_model, input_features, output_features, num_linear_layers, total_trainable_parameters, layers: list[str] }`, `dataset`: `{ name, split, total_samples }`, `equivalence_audit`: `{ available: bool, error: str \| null, summary: dict \| null }` (contents of `results/equivalence_seed39_n100_summary.json`) | `inspect_model_architecture`, `MathematicalNetwork`, `results/equivalence_seed39_n100_summary.json` | `503` if checkpoint/dataset failed startup load; `200` with `equivalence_audit.available=false` if JSON missing or invalid |

### 7.2 Individual Verification

| Method | Route | Purpose | Request Fields | Response Fields | Reused Python Functionality | Error Cases |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/samples/{sample_index}` | Retrieve MNIST test sample image, ground-truth label, and model nominal prediction | Path: `sample_index: int` (`0 <= idx < dataset_len`) | `sample_index: int`, `label: int`, `predicted: int`, `logits: list[float]`, `pixel_min: float`, `pixel_max: float`, `image_matrix: list[list[float]]` *(28×28)* `[confirm in Phase 2: matrix vs base64 PNG]` | `dataset[sample_index]`, `flatten_image`, `dashboard.services.predict_image` | `422` if `sample_index` out of range or non-int |
| `POST` | `/api/verify/baseline` | Run baseline IBP verification for one sample at one $\varepsilon$ | `{ sample_index: int, epsilon: float }` | Serialized `IndividualOutcome`: `sample_index`, `epsilon`, `label`, `predicted`, `target_class`, `baseline_status`, `baseline_margin`, `baseline_time_seconds`, `baseline_lower: list[float]`, `baseline_upper: list[float]`, `error: str \| null` | `validate_epsilon`, `flatten_image`, `predict_image`, `run_baseline_verification` | `422` invalid `sample_index` or negative/NaN/inf `epsilon`; `200` with `baseline_status="ERROR"` if verifier raises |
| `POST` | `/api/verify/refined` | Run LP-refined (IBP + HiGHS) verification for one sample at one $\varepsilon$ | `{ sample_index: int, epsilon: float }` | Serialized `IndividualOutcome`: `sample_index`, `epsilon`, `label`, `predicted`, `target_class`, `baseline_status`, `baseline_margin`, `refined_status`, `refined_margin`, `refined_time_seconds`, `lp_refinement_time_seconds`, `refinement_status`, `refinement_targets`, `refinement_accepted`, `refinement_rejected`, `refined_lower: list[float]`, `refined_upper: list[float]`, `error: str \| null` | `validate_epsilon`, `flatten_image`, `predict_image`, `run_refined_verification` | `422` invalid `sample_index` or `epsilon`; `200` with `refined_status="ERROR"` if solver/pipeline raises |

### 7.3 Experiment Creation, Execution & Progress

| Method | Route | Purpose | Request Fields | Response Fields | Reused Python Functionality | Error Cases |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/experiments/runs` | Validate config and enqueue a background development or configured experiment | `{ mode: "development" \| "configured", sample_count?: int, epsilons?: list[float] \| str, seed?: int }` *(dev mode forces `sample_count=5, epsilons=[0.03], seed=42`)* | `202 Accepted`: `{ job_id: string, status: "queued" \| "running", experiment_type: string, total_pairs: int, estimated_lp_solves: int, config: dict }` | `parse_epsilon_input`, `ExperimentConfig`, `execute_and_save_experiment` | `422` invalid `sample_count` (`<1` or `>10000`), invalid/negative/non-finite `epsilons`, invalid `seed`; `409` if single-worker queue policy rejects concurrent job `[confirm in Phase 2: queue vs 409]` |
| `GET` | `/api/experiments/jobs/{job_id}` | Poll status & progress of a background experiment run | Path: `job_id: string` | `{ job_id, status: "queued" \| "running" \| "completed" \| "failed", stage: string, completed_pairs: int, total_pairs: int, current_epsilon: float \| null, current_sample_index: int \| null, elapsed_seconds: float, experiment_id: string \| null, metadata: ExperimentMetadataDTO \| null, error: string \| null }` `[confirm in Phase 2]` | In-memory `JobRegistry` wrapping `run_experiment` + `save_experiment` | `404` unknown `job_id` |
| `GET` | `/api/experiments/jobs/{job_id}/events` | Stream live progress updates via SSE until completion or failure | Path: `job_id: string` | SSE stream (`event: progress \| completed \| failed`, `data:` JSON matching job status payload) | `JobRegistry` subscriber queue | `404` unknown `job_id` |

### 7.4 Experiment History, Results & Exports

| Method | Route | Purpose | Request Fields | Response Fields | Reused Python Functionality | Error Cases |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/experiments` | List all stored experiments sorted newest first | Optional query: `status?: string`, `experiment_type?: string` `[confirm in Phase 2]` | `{ experiments: list[ExperimentMetadataDTO] }` (`experiment_id`, `experiment_type`, `timestamp`, `sample_count`, `epsilons`, `seed`, `status`, `experiment_name`, `folder_name`, `error_message`) | `dashboard.storage.list_experiments` | `500` unexpected filesystem error (incomplete/corrupted folders return in list with `status` + `error_message`) |
| `POST` | `/api/experiments/refresh` | Scan `results/` and import newly completed legacy/CLI runs | None | `{ imported_count: int, imported: list[ExperimentMetadataDTO], experiments: list[ExperimentMetadataDTO] }` | `import_legacy_experiments`, `list_experiments` | `500` unexpected I/O failure |
| `GET` | `/api/experiments/{experiment_id}` | Load full experiment metadata, config, aggregated metrics, chart series, and per-sample records without re-running verification | Path: `experiment_id: string` | `{ metadata: ExperimentMetadataDTO, summary: dict, config: dict, selection: dict, metrics: list[EpsilonMetricsDTO], charts: { certification_rates, interval_widths, runtime, improvement }, records: list[SampleRecordDTO] }` | `list_experiments`, `load_experiment_data`, `load_experiment_result`, `certification_rate_series`, `width_series`, `runtime_series`, `improvement_series` | `404` experiment folder not found; `409` or `422` if status is `Incomplete` or `Corrupted` (with `error_message` detail) |
| `GET` | `/api/experiments/{experiment_id}/export/csv` | Download raw `samples.csv` (exact `SampleRecord.CSV_FIELDNAMES` bytes) | Path: `experiment_id: string` | `text/csv` attachment (`{experiment_id}_samples.csv`) | Reads `exp_dir / "samples.csv"` directly (fallback: in-memory `csv.DictWriter` with `SampleRecord.CSV_FIELDNAMES`) | `404` experiment or `samples.csv` missing |
| `GET` | `/api/experiments/{experiment_id}/export/json` | Download raw `summary.json` | Path: `experiment_id: string` | `application/json` attachment (`{experiment_id}_summary.json`) | Reads `exp_dir / "summary.json"` directly | `404` experiment or `summary.json` missing |

### 7.5 Experiment Comparison

| Method | Route | Purpose | Request Fields | Response Fields | Reused Python Functionality | Error Cases |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/experiments/compare` | Run comparability validation, 10-metric tables per matching $\varepsilon$, and comparison chart series for $\ge 2$ completed experiments | `{ experiment_ids: list[string] }` *(min length 2)* | `{ experiments: list[ExperimentMetadataDTO], matching_epsilons: list[float], all_epsilons: list[float], differing_epsilons: dict[str, list[float]], sample_counts_differ: bool, seeds_differ: bool, identical_samples: bool, notices: list[str], tables_by_epsilon: dict[str, list[dict]], chart_series: dict }` *(from `get_comparison_series_for_plotting`)* `[confirm in Phase 2: string keys for epsilon dicts in JSON]` | `list_experiments`, `load_experiment_result`, `ComparisonItem`, `build_comparison_analysis`, `build_comparison_metric_table`, `get_comparison_series_for_plotting` | `422` `< 2` IDs or non-`Completed` experiment selected; `404` unknown `experiment_id` |

*(Note: JSON object keys must be strings, so `per_epsilon` in `get_comparison_series_for_plotting` and `tables_by_epsilon` will serialize epsilon keys as canonical strings or a list of `{ epsilon, ... }` objects in Phase 2.)*

---

## 8. React Feature Parity Matrix

| Existing Streamlit feature | Existing implementation | Required API | React implementation | Validation method |
| :--- | :--- | :--- | :--- | :--- |
| Global warm research theme & typography | `apply_research_theme()`, `.streamlit/config.toml` (`#F7F3ED`, `#F1EAE2`, `#FFFCF8`, `#702B3A`, `DM Serif Display`, `Inter`, `JetBrains Mono`) | None | Tailwind CSS theme tokens + Google Fonts + shadcn/ui base styles | Visual inspection against Streamlit screenshots |
| Sidebar branding, Verified Network card, Active Benchmark Run card | `main()` lines 1884–1925 | `GET /api/overview` + React state/localStorage for active `experiment_id` | Persistent sidebar drawer showing **dynamic** `model` layers from `/api/overview` (fixing hardcoded `100->50`) + active run badge | Unit test + verify layer dims match `MiniCertNet` (`784→64→32→10`) |
| 6-page sidebar navigation & programmatic redirect | `st.radio("Workspace Navigation")` + `session_state["workspace_nav"]` | None | React Router routes (`/`, `/verify`, `/experiments/new`, `/experiments/results`, `/experiments/history`, `/experiments/compare`) | E2E navigation test + URL deep-link check |
| Overview: Hero, Problem, 6-Step Methodology, LaTeX condition, Callout, 4-Card Architecture, Scope & Limits | `render_overview_section()` lines 673–878 | `GET /api/overview` (for dynamic model info) | Static React/TypeScript components + KaTeX/MathJax rendering for $L_t > \max_{j\neq t} U_j$ + Framer Motion subtle entrance | Visual parity check + math formula rendering check |
| Overview: 100-Sample Equivalence Audit KPIs & summary card | `render_overview_section()` lines 887–946 reading `equivalence_seed39_n100_summary.json` | `GET /api/overview` (`equivalence_audit`) | 4 KPI cards (`100`, `400`, `0 / 400`, `6.54×`) + summary card + missing/corrupt fallback alert | Assert numbers match `equivalence_seed39_n100_summary.json` |
| Individual Verification: Sample Index input (`0..9999`) & $\varepsilon$ slider (`0.000..0.200`, step `0.005`, default `0.030`) | `st.number_input` + `st.slider` (`app.py:982–1002`) | `GET /api/samples/{sample_index}` | Controlled numeric input + shadcn/ui Slider (plus direct numeric readout); debounced fetch of sample preview | Playwright test changing index & slider bounds |
| Individual Verification: 28×28 MNIST image preview & Classification Summary card | `st.image(vector.reshape(28, 28))` + `predict_image()` (`app.py:1005–1037`) | `GET /api/samples/{sample_index}` | HTML `<canvas>` or grayscale `<img>` rendering 28×28 tensor + Classification Summary card with Ground Truth, Prediction, Target Class, Perturbation Space | Compare pixel rendering & predicted class against `MathematicalNetwork.forward` |
| Individual Verification: Run Baseline IBP & Run LP-Refined buttons + per-`(index, eps)` session caching | `st.button` + `baseline_cache` / `refined_cache` (`app.py:1040–1076`) | `POST /api/verify/baseline`, `POST /api/verify/refined` | Two action buttons with loading spinners, error banners, and client-side `Map<"${index}:${eps}", Outcome>` cache | API integration test + UI state cache test across sample switching |
| Individual Verification: Baseline & Refined Outcome cards + status pill badges + `—` for missing | `status_badge`, `st.metric`, `format_optional` (`app.py:1079–1146`) | `POST /api/verify/baseline`, `POST /api/verify/refined` | Status badge component (`CERTIFIED` green, `INCONCLUSIVE` amber, `ERROR` red) + metric cards (`—` for `null`, `0` preserved as `0`) | Unit test `formatOptional(null) === "—"` and `formatOptional(0) === "0"` |
| Individual Verification: Class-by-class Output Logit Bounds table (4-col single or 8-col comparison) | `render_bounds_table()` (`app.py:544–586`, `1147–1174`) | `POST /api/verify/baseline`, `POST /api/verify/refined` | TanStack Table with `Class ★ (Target)`, `Lower/Upper/Width`, and dynamic `Refined` + `Width Tightening (%)` columns when both exist | Compare table values to 4 decimals against Streamlit output |
| New Experiment: Parameters (`sample_count`, `epsilons`, `seed`) & validation | `st.number_input`, `st.text_input`, `parse_epsilon_input()` (`app.py:1205–1263`) | `POST /api/experiments/runs` | React form with client-side + server Pydantic validation (non-empty finite nonnegative $\varepsilon$, `1 <= sample_count <= 10000`, `seed >= 0`) | Unit + integration validation error tests |
| New Experiment: `>= 200` pairs computational warning | `if total_pairs >= 200: st.warning(...)` (`app.py:1264–1269`) | None (computed live from form inputs) | Live inline warning banner showing `{total_pairs} pairs ({total_pairs * 20} LP solves)` whenever `sample_count * epsilons.length >= 200` | UI test verifying banner threshold at 199 vs 200 |
| New Experiment: Fast Dev Run (`n=5, eps=0.03, seed=42`) & Configured Run + progress + redirect | `run_dev` / `run_conf` buttons + `st.spinner` (`app.py:1236–1303`) | `POST /api/experiments/runs`, `GET .../events` (SSE), `GET .../jobs/{id}` | Dual buttons + live progress bar (`completed_pairs / total_pairs`, current $\varepsilon$) + success banner with "View in Results" action | Integration test running dev experiment (`n=5, eps=0.03`) end-to-end |
| Experiment Results: Auto-load latest Completed run & Active Identifier card | `main()` lines 1859–1871 & `render_results_section()` lines 1337–1356 | `GET /api/experiments`, `GET /api/experiments/{id}` | Load `?id=` query param or fallback to latest `"Completed"` experiment from `/api/experiments`; render identifier card | E2E test on fresh page load |
| Experiment Results: Per-$\varepsilon$ Aggregated Summary metrics | `render_results_section()` lines 1358–1385 | `GET /api/experiments/{id}` | Per-$\varepsilon$ metric cards (`Baseline Certified %`, `Refined Certified %`, `Improvement Delta pp`, `Verification Errors`) | Assert exact match with `summary.json` |
| Experiment Results & History: 4 Interactive Charts (Cert Rate, Widths, Runtime w/ auto log-scale, Improvement) | `plot_certification_rates`, `plot_interval_widths`, `plot_runtime`, `plot_improvement` | `GET /api/experiments/{id}` (`charts`) | 4-tab Recharts views (`LineChart` + `BarChart`), missing `null` points skipped/labeled `"n/a"` (never 0), auto log Y-axis when `max/min >= 100` | Visual & data parity check against `evaluation_seed39_n100` |
| Chart Toolbar: `Show Legend`, `Show Grid`, `Download PNG`, `Accessible Numerical Data & CSV Export` | `render_chart_panel()` (`app.py:588–662`) | Client-side data (optional `/export/csv` or Blob) | Chart toolbar toggles (`showLegend`, `showGrid`), client-side SVG→PNG export (`{key}.png`), collapsible TanStack Table + CSV Blob download (`{key}_data.csv`) | Click PNG/CSV download & inspect exported files |
| Results & History: Per-Sample Verification Records table (`PER_SAMPLE_COLUMNS`, 17 cols) | `records_table_rows()`, `st.dataframe` (`app.py:1438–1444`) | `GET /api/experiments/{id}` (`records`) | TanStack Table with sorting, status/epsilon filtering, pagination, and missing values formatted as `"—"` | Test sorting/filtering + verify 400 rows for `seed39_n100` |
| Results & History: Download `samples.csv` & `summary.json` | `st.download_button` (`app.py:1453–1471`, `1653–1675`) | `GET /api/experiments/{id}/export/csv`, `.../export/json` | Direct file download links/buttons preserving exact byte/schema parity without mutating disk | Byte-for-byte / schema comparison with `results/experiments/` files |
| History: Refresh History (legacy import), Summary Table, Select & Inspect, Status warnings, Load into Results | `render_history_section()` (`app.py:1479–1676`) | `GET /api/experiments`, `POST /api/experiments/refresh`, `GET /api/experiments/{id}` | Refresh button calling `/refresh`, TanStack summary table (`HISTORY_TABLE_COLUMNS`), row selector, `Incomplete`/`Corrupted` guard, Config JSON viewer, `"Load into Active Results View"` button | Test with `Incomplete` / `Corrupted` mock folders + Refresh button |
| Comparison: Multiselect ($\ge 2$ Completed runs), Comparability Notices, Matching $\varepsilon$ resolution | `render_comparison_section()` (`app.py:1699–1758`), `build_comparison_analysis` | `GET /api/experiments`, `POST /api/experiments/compare` | Multi-select picker (default 2 newest Completed), warning/info alerts for differing seeds/counts/epsilons/types, error state if no common $\varepsilon$ | Verify notices match `test_comparison_*` scenarios |
| Comparison: 10-Metric Side-by-Side Table (single or tabbed per matching $\varepsilon$) + 4 Comparative Grouped Bar Charts | `build_comparison_metric_table`, `plot_comparison_*` (`app.py:1760–1822`) | `POST /api/experiments/compare` | Per-$\varepsilon$ tabs + TanStack 10-metric comparison table + 4 Recharts grouped `BarChart` panels with `render_chart_panel` toolbar/PNG/CSV exports | Verify all 10 metrics & `"—"` missing handling against `test_comparison_metric_table` |

---

## 9. Target Directory Structure

Existing packages (`models/`, `abstract_domain/`, `verification/`, `evaluation/`, `dashboard/`, `data/`, `results/`, `tests/`) stay **completely in place** so Streamlit and the 686-test suite continue to function uninterrupted.

```text
MiniCert/
├── abstract_domain/          # UNTOUCHED: Interval, Box, bounds, IBP & refinement propagation
├── models/                   # UNTOUCHED: MiniCertNet, FCNet, checkpoint loader & float64 extractor
├── verification/             # UNTOUCHED: InputRegion, SafetyChecker, Planet LP, HiGHS solver, pipeline
├── evaluation/               # UNTOUCHED (optional keyword progress_callback in Phase 2): runner, metrics, exports
├── dashboard/                # UNTOUCHED: Streamlit app + reusable components/services/storage/comparison
├── data/                     # UNTOUCHED: MNIST raw dataset
├── results/                  # UNTOUCHED: Historical evaluations, equivalence study, experiments/
├── tests/                    # Existing 686 tests + new backend API tests
│   └── test_backend_api.py   # NEW (Phase 2): FastAPI schema, endpoint, export parity & job tests
├── backend/                  # NEW (Phase 2): FastAPI application wrapping existing engine
│   ├── __init__.py
│   ├── main.py               # FastAPI app, CORS, lifespan (caches network, dataset, legacy import)
│   ├── config.py             # PROJECT_ROOT, CHECKPOINT_PATH, DATA_DIR, RESULTS_DIR resolution
│   ├── dependencies.py       # Typed accessors for cached network, dataset, JobManager
│   ├── jobs.py               # ThreadPoolExecutor(max_workers=1) + SSE/polling JobRegistry
│   ├── schemas/              # Pydantic v2 request/response DTOs matching existing dataclasses
│   │   ├── __init__.py
│   │   ├── common.py
│   │   ├── verification.py
│   │   └── experiments.py
│   └── routers/
│       ├── __init__.py
│       ├── overview.py       # GET /api/overview
│       ├── verification.py   # GET /api/samples/{idx}, POST /api/verify/baseline, /api/verify/refined
│       └── experiments.py    # Runs, jobs, SSE events, list, refresh, detail, compare, CSV/JSON exports
├── frontend/                 # NEW (Phase 3+): React + TypeScript + Vite SPA
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts        # Proxies /api -> FastAPI http://localhost:8000
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/              # Typed fetch/EventSource client + generated/mirrored TS types
│       ├── components/
│       │   ├── layout/       # Research sidebar drawer, page headers, theme tokens
│       │   ├── charts/       # ChartPanel (legend/grid toggles, PNG export, data drawer) + Recharts wrappers
│       │   ├── tables/       # TanStack Table wrappers (BoundsTable, RecordsTable, HistoryTable, ComparisonTable)
│       │   └── ui/           # shadcn/ui primitives + StatusBadge + MathBlock (KaTeX)
│       ├── pages/
│       │   ├── OverviewPage.tsx
│       │   ├── IndividualVerificationPage.tsx
│       │   ├── NewExperimentPage.tsx
│       │   ├── ExperimentResultsPage.tsx
│       │   ├── ExperimentHistoryPage.tsx
│       │   └── ExperimentComparisonPage.tsx
│       └── lib/              # Formatters (missing -> "—", 0 -> "0"), CSV/PNG client helpers
├── saved_model.pth
├── requirements.txt          # Later: add fastapi, pydantic (or backend/requirements.txt)
└── REACT_MIGRATION_AUDIT.md  # THIS AUDIT REPORT
```

**Why not move `dashboard/services.py`, `dashboard/storage.py`, `dashboard/components.py`, or `dashboard/comparison.py` now?**  
Moving them immediately would risk breaking `dashboard/app.py` and `tests/test_dashboard.py`. Importing them from `backend/` keeps the existing Streamlit app and all 686 tests intact throughout the parallel migration; if desired, they can be extracted into a shared `services/` package only *after* Streamlit is retired.

---

## 10. Migration Phases & Dependencies

### Recommended Implementation Order
1. **Phase 1 (Current — Complete upon approval):** Read-only repository audit and `REACT_MIGRATION_AUDIT.md`.
2. **Phase 2 — Backend API (`backend/`):**
   - Add `fastapi` and `pydantic` (keeping `uvicorn` / `starlette`).
   - Implement FastAPI lifespan loading `saved_model.pth`, MNIST test dataset, and `import_legacy_experiments()`.
   - Implement Overview, Sample & Individual Verification, History, Results, Comparison, and read-only CSV/JSON Export endpoints.
   - Implement `JobRegistry` + `ThreadPoolExecutor(max_workers=1)` + SSE/polling endpoints (optionally adding backwards-compatible `progress_callback=None` to `run_experiment()`).
   - Write comprehensive `tests/test_backend_api.py` verifying byte/value parity with existing `dashboard.*` and `evaluation.*` outputs.
3. **Phase 3 — Frontend Foundation & Read-Only Views (`frontend/`):**
   - Scaffold Vite + React + TypeScript + Tailwind CSS + shadcn/ui + Lucide React + Framer Motion + KaTeX + TanStack Table + Recharts.
   - Implement Sidebar Shell (with dynamic model architecture fix), Overview Page, Experiment History Page, and Experiment Results Page (including ChartPanel PNG/CSV export and artifact downloads).
4. **Phase 4 — Interactive Verification, Background Execution & Comparison:**
   - Implement Individual Verification Page (28×28 canvas, $\varepsilon$ slider, client-side `(index, eps)` cache, Baseline & Refined runs, 4/8-column Logit Bounds table).
   - Implement New Experiment Page (validation, $\ge 200$ pairs warning, SSE live progress bar + polling fallback, redirect to Results).
   - Implement Experiment Comparison Page (multi-select, comparability notices, per-$\varepsilon$ 10-metric tabs, 4 grouped Recharts comparison charts).
5. **Phase 5 — Parallel Verification, Parity Sign-off & Optional Cutover:**
   - Run full Playwright E2E + backend pytest suite + side-by-side numeric parity audit against Streamlit on `conf_seed42_n20`, `dev_seed42_n5`, and `evaluation_seed39_n100`.
   - Keep Streamlit runnable until full parity sign-off is approved.

---

## 11. Regression & Research Integrity Strategy

### 11.1 Verified Baseline & Automated Checks
- **Baseline:** `686 passed in 21.79s` confirmed via `.\venv\Scripts\python.exe -m pytest -p no:cacheprovider tests/ -q`.
- **Every backend/frontend PR must:**
  1. Re-run `pytest tests/` and require all 686 existing tests to pass without relaxing tolerances or modifying assertions.
  2. Run `tests/test_backend_api.py` asserting exact numerical parity between:
     - `POST /api/verify/baseline` & `POST /api/verify/refined` vs. `dashboard.services.run_baseline_verification` & `run_refined_verification`.
     - `GET /api/experiments/{id}` vs. `dashboard.storage.load_experiment_result` & `dashboard.components.*_series`.
     - `GET /api/experiments/{id}/export/csv` & `/export/json` vs. existing files in `results/experiments/`.
     - `POST /api/experiments/compare` vs. `dashboard.comparison.build_comparison_analysis` & `build_comparison_metric_table`.
  3. Run a deterministic smoke run (`n=5, eps=[0.03], seed=42` in a temporary directory) via the FastAPI job runner and verify identical `SampleRecord` and `EpsilonMetrics` values against `evaluation.run_experiment`.

### 11.2 Invariants That Must Remain Unchanged
- IBP propagation (`abstract_domain.box`, `abstract_domain.propagation`).
- LP constraint generation, Planet/triangle ReLU relaxation, and SciPy HiGHS solver + dual/primal validation (`verification.lp`, `verification.lp_solver`, `1e-8` validation tolerance, `1e-6` dual sign cap, `1e-4` primal/gap caps, `1e-12` containment tolerance).
- L4-only default refinement (`select_refinement_targets(..., include_hidden_relu=False)`).
- `CERTIFIED` (strictly positive margin $L_t > \max_{j \neq t} U_j$) vs. `INCONCLUSIVE` semantics.
- `saved_model.pth`, existing `results/` files, and `results/experiments/` folders/IDs.
- CSV (`SampleRecord.CSV_FIELDNAMES`) and JSON (`ExperimentResult.to_dict()`, `allow_nan=False`) export schemas and missing-value distinction (`None` / `""` / `"—"` vs. `0`).

### 11.3 Research Distinctions to Enforce in UI Copy & Data Model
- **Baseline IBP vs. LP-Refined Certification** (`evaluation/experiment.py`) and **All-Target vs. L4-Only Equivalence Validation** (`evaluation/equivalence.py`) are separate experiments and must never be merged in summaries, tables, or comparison charts.
- `INCONCLUSIVE` must always be explained as an inability to prove strict dominance under the relaxation—never as an adversarial counterexample or proof of unsafety.
- Equivalence audit results (`results/equivalence_seed39_n100_summary.json`) apply to the evaluated `MiniCertNet` checkpoint and seed-39 population; React UI copy must preserve scope caveats rather than claiming universal equivalence.

---

## 12. Risks & Mitigation Measures

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Parallel `results/experiments/` writes between Streamlit and FastAPI** | Concurrent runs or legacy imports could race if both servers run simultaneously | `dashboard/storage.py` uses unique IDs + atomic `.tmp_*` + `os.replace`, preventing overwrites; avoid running simultaneous write benchmarks across both apps, and test `import_legacy_experiments()` idempotency. |
| **CPU/HiGHS thread contention distorting runtime metrics** | Running multiple experiments concurrently inflates `lp_refinement_time_seconds` | Use `ThreadPoolExecutor(max_workers=1)` in `backend/jobs.py` so only one benchmark executes at a time. |
| **JSON serialization of `±inf` or `NaN`** | Standard JSON rejects `Infinity`/`NaN` (`allow_nan=False` in `exports.py`); single-class edge cases produce `-inf`/`+inf` margins | `SampleRecord` and `EpsilonMetrics` enforce finite floats for MNIST (10 classes); guard Pydantic serializers explicitly so non-finite floats fail loudly or map explicitly on single-class edge cases. |
| **Python 3.11 / PyTorch / Windows path handling** | Windows `Path` objects (`C:\Users\harsh\MiniCert\...`) inside `config.json` / `summary.json` | Keep `Path` serialization consistent with existing `config.json`; sanitize `{experiment_id}` path params in FastAPI against path traversal (`..`, `/`, `\`). |
| **Chart PNG export divergence in React** | Matplotlib produces 200-DPI publication PNGs; browser SVG→PNG rendering differs slightly | Implement clean SVG→Canvas→PNG export in React matching the `#FFFCF8` card background & exact palette (`#702B3A`, `#786B67`, `#627D68`, `#A7793D`, `#963E50`); optionally expose a `/charts/png` Matplotlib endpoint later if exact Matplotlib PNG parity is needed. |
| **Missing `pandas` / unpinned `requirements.txt`** | Fresh environments may miss `fastapi`, `pydantic`, or `pandas` (for Streamlit) | Add explicit backend dependencies (`fastapi`, `pydantic`, `uvicorn`) in Phase 2 without breaking `requirements.txt` for Streamlit. |

---

## 13. Open Questions Requiring Human Decisions

1. **Sidebar Model Display Fix:** `dashboard/app.py` displays `784 -> 100 -> 50 -> 10 · 4 Layers`, while `MiniCertNet` is actually `784 -> 64 -> 32 -> 10` (3 linear + 2 ReLU layers). Should the React UI display the accurate inspected architecture immediately (recommended), and should the Streamlit sidebar also be corrected later?
2. **Comparison Chart CSV Export Format:** Currently `dashboard/app.py` passes `pd.json_normalize(comp_series["experiments"])` (all metrics across all epsilons) to every comparison chart's CSV download. Should React preserve that exact wide table for parity, or export only the chart's specific metric (e.g., `refined_rate_pct` per experiment per epsilon)?
3. **Concurrent Experiment Requests:** When a configured experiment is already running in FastAPI, should a second `POST /api/experiments/runs` request **queue** behind `max_workers=1` (`202 Accepted` with `"queued"` status) or return `409 Conflict`?
4. **Chart PNG Export Strategy:** Is client-side Recharts SVG→PNG export sufficient for publication downloads, or do you want a FastAPI endpoint wrapping `dashboard/visualizations.py` to generate identical 200-DPI Matplotlib PNGs?
5. **Overview Equivalence Audit Scope:** Should React keep Overview tied specifically to `results/equivalence_seed39_n100_summary.json` (matching Streamlit), or also surface a selector if additional equivalence files are added later?
6. **Active Experiment Persistence in React:** Streamlit stores the active experiment in `st.session_state`. In React, should the active experiment on `Experiment Results` be driven by URL query param (`/experiments/results?id=...`, falling back to newest Completed run) so links are shareable and survive page reloads?

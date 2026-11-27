# MiniCert — Phase 5: End-to-End Acceptance and Migration Validation Report

**Date:** 2026-11-28 (UTC+05:30)  
**Scope:** End-to-end acceptance audit of the MiniCert FastAPI + React/TypeScript migration alongside existing Streamlit (`dashboard/app.py`) prior to any Streamlit retirement decision.  
**Audit Outcome:** **HOLD / DO NOT RETIRE STREAMLIT YET** — Backend API integration, data integrity, numerical verification parity, frontend static build/lint, and all 697 Python tests passed; however, **live browser-based functional testing and responsive/UI interaction checks could not run in Chrome (`NOT TESTED`)** because Chrome DevTools MCP remote debugging was unavailable.

---

## 1. Environment and Startup Results

### Server Processes & Commands

| Service | Command | Endpoint | Observed Status |
| :--- | :--- | :--- | :--- |
| FastAPI Backend | `.\venv\Scripts\uvicorn.exe backend.main:app --host 127.0.0.1 --port 8000` | `http://127.0.0.1:8000` | Started cleanly (`Application startup complete`); terminated cleanly at session stop (`19:44Z`) |
| React Frontend (Vite) | `npm run dev -- --host 127.0.0.1 --port 5173` (in `frontend/`) | `http://127.0.0.1:5173/` | Started cleanly (`VITE v7.3.8 ready in 829 ms`); terminated cleanly at session stop (`19:44Z`) |
| Streamlit Dashboard | `.\venv\Scripts\streamlit.exe run dashboard/app.py --server.port 8501 --server.address 127.0.0.1` | `http://127.0.0.1:8501` | Started cleanly (`Uvicorn server started on 127.0.0.1:8501`); preserved untouched, terminated cleanly at stop |

### Environment Configuration & Connectivity

- **Frontend env configuration:** `frontend/.env` does not exist (`HAS_ENV=False`). `frontend/.env.example` provides `VITE_API_BASE_URL=http://127.0.0.1:8000`. Without `frontend/.env`, `frontend/vite.config.ts` dev server proxies `/api` requests to `http://127.0.0.1:8000` (`changeOrigin: true`).
- **In-Process Backend Initialization (`FastAPI TestClient` on `create_app(BackendConfig())`):**
  - `GET /api/health` -> HTTP `200`:
    - `status`: `"ok"`
    - `model_loaded`: `true`
    - `network_loaded`: `true`
    - `dataset_loaded`: `true` (`dataset_size`: `10000` MNIST test samples)
    - `experiments_dir_ready`: `true`
    - `active_jobs`: `0`, `legacy_imported_count`: `0`, `startup_error`: `null`
  - `GET /api/model/architecture` -> HTTP `200`:
    - `source_model`: `"MiniCertNet"`
    - `input_features`: `784`, `output_features`: `10`
    - `num_linear_layers`: `3`, `num_sequence_layers`: `5`, `total_trainable_parameters`: `52650`
    - `layers`: `["Linear(784 -> 64)", "Linear(64 -> 32)", "Linear(32 -> 10)"]`
- **CORS Verification (In-Process ASGI `TestClient`):**
  - `OPTIONS /api/overview` with `Origin: http://127.0.0.1:5173` -> HTTP `200`, `access-control-allow-origin: http://127.0.0.1:5173`.
  - `GET /api/health` with `Origin: http://localhost:5173` -> HTTP `200`, `access-control-allow-origin: http://localhost:5173`.
  - `GET /api/health` with `Origin: http://evil.example` -> HTTP `200`, `access-control-allow-origin: None` (header withheld).
- **Direct Browser Frontend Loading & Cross-Origin Browser Fetch:** **`NOT TESTED`** (Chrome DevTools MCP connection unavailable; live browser page load of `http://127.0.0.1:5173/` and browser-initiated API calls were not executed during this audit).

---

## 2. Browser-Based Test Results

**Overall Browser Audit Classification:** **`NOT TESTED`** (Blocked by Chrome DevTools MCP unavailability)

Two attempts to drive live Chrome via the `browser` subagent (`mcp_chrome_devtools_list_pages`) failed immediately with:

```text
Could not connect to Chrome. Check if Chrome is running and remote debugging is enabled by going to chrome://inspect/#remote-debugging.
Cause: Could not find DevToolsActivePort for chrome at C:\Users\harsh\AppData\Local\Google\Chrome\User Data\DevToolsActivePort
Cause: ENOENT: no such file or directory, open 'C:\Users\harsh\AppData\Local\Google\Chrome\User Data\DevToolsActivePort'
```

Per strict audit protocol (no bypassing sandbox/process checks, no socket scraping in place of real browser validation, and no fabricated claims), automated browser validation was aborted cleanly when the user directed `not tested`.

### Page-by-Page Browser Testing Status

| Route | Page | Browser Test Status | Notes |
| :--- | :--- | :--- | :--- |
| `/` | Overview | `NOT TESTED` | Backend `/api/model/architecture` and `/api/overview` verified via `TestClient`; React UI rendering, chart toggles, and PNG/CSV downloads not tested in browser |
| `/verify` | Individual Verification | `NOT TESTED` | Backend `/api/samples/{id}` and `/api/verification` verified against Python engine; client caching `(sample_index, epsilon, mode)`, digit preview canvas, and UI table sorting not tested in browser |
| `/experiments/new` | New Experiment | `NOT TESTED` | Backend `POST /api/experiments` validation (`422`), `QUEUED`/`RUNNING`/`COMPLETED`/`FAILED`, SSE, and polling endpoints covered by `tests/test_backend_api.py`; UI form validation, development preset submit, `sessionStorage` reload recovery, and UI polling fallback not tested in browser |
| `/experiments/results` | Experiment Results | `NOT TESTED` | Backend `/api/experiments/{id}/results` and `/api/exports/{id}/*` verified via `TestClient`; 4 chart tabs, chart accessibility tables, `SampleRecordsTable` filtering/sorting/column toggles/pagination, and downloads not tested in browser |
| `/experiments/history` | Experiment History | `NOT TESTED` | Backend `/api/history` and incomplete/corrupted fixture handling covered by `pytest` and `TestClient`; table UI, detail inspection, Refresh History, "Load into Active Results View", and download triggers not tested in browser |
| `/experiments/compare` | Experiment Comparison | `NOT TESTED` | Backend `/api/comparison` metric computation, notices, and matching-epsilon filtering verified via `TestClient`; UI selection, comparison tables, and grouped charts not tested in browser |

*(Note: While inspecting Uvicorn task logs from earlier pre-audit startup (`task-350.log`), earlier manual session requests to `http://127.0.0.1:8000` including `20261127_192338_6425e0` had returned `200 OK` / `202 Accepted`; however, those logs are not a substitute for an audited Chrome DOM/UI validation pass and are not counted as browser test passes.)*

---

## 3. Feature-by-Feature Acceptance Matrix

> Classification rules used below:  
> - **PASS:** Verified end-to-end for the stated scope during Phase 5.  
> - **PARTIAL:** Backend/API/build/engine layer verified (`PASS`), while interactive browser UI layer could not run (`NOT TESTED`).  
> - **NOT TESTED:** Requires live browser/DOM inspection and was blocked by `DevToolsActivePort` ENOENT.  
> - **FAIL:** Observed defect or failed assertion (none observed in tested layers).

| Feature / Requirement | Backend / Engine Layer | Browser UI Layer | Overall Status | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| FastAPI startup, lifespan caching, `/api/health` | `PASS` | N/A | **`PASS`** | `TestClient` `/api/health` (`200`, `10000` dataset, `MiniCertNet` loaded); `test_health_and_startup_resources_cached_once`, `test_startup_failure_reports_unhealthy_503` |
| Environment config & Vite dev proxy | `PASS` (verified files) | `NOT TESTED` | **`PARTIAL`** | Verified `frontend/vite.config.ts` (`/api -> 127.0.0.1:8000`), `.env.example`, `HAS_ENV=False`; browser proxy runtime not checked |
| CORS policy | `PASS` (ASGI `TestClient`) | `NOT TESTED` | **`PARTIAL`** | Allowed `127.0.0.1:5173` & `localhost:5173`, withheld header on `evil.example` |
| Overview: dynamic architecture & parameters | `PASS` | `NOT TESTED` | **`PARTIAL`** | `/api/model/architecture` returns `MiniCertNet`, `784->64->32->10`, `52650` params; Sidebar UI not inspected in browser |
| Overview: separate L4-only Equivalence Audit & real summary data | `PASS` | `NOT TESTED` | **`PARTIAL`** | `/api/overview` separates `equivalence_audit` (`Equivalent`, `400/400` pairs, `0.0` diffs, `6.54x` mean / `7.29x` median speedup) from `latest_completed_experiment` (`20261127_192338_6425e0`) |
| Individual Verification: API parity & sample preview | `PASS` | `NOT TESTED` | **`PARTIAL`** | `/api/samples/0` (`200`, `label=7, predicted=7`); `/api/verification` matches engine & `dashboard.services` to `0.00e+00` across samples `0, 1, 5` at `eps=0.01, 0.03` |
| Individual Verification: client result caching `(sample, eps, mode)` | N/A | `NOT TESTED` | **`NOT TESTED`** | Pure frontend state caching requires live Chrome verification |
| New Experiment: invalid config rejection | `PASS` | `NOT TESTED` | **`PARTIAL`** | `POST /api/experiments` with `sample_count=0, epsilons=[], seed=-1` returns `422`; UI inline validation not tested in browser |
| New Experiment: preset submit, `QUEUED`/`RUNNING`/`COMPLETED`/`FAILED`, SSE, polling | `PASS` (`pytest` mocked/tmp) | `NOT TESTED` | **`PARTIAL`** | `test_experiment_background_execution_sse_and_polling_and_persistence`, `test_failed_experiment_does_not_stay_running`, `test_sse_client_disconnect_cleanup`; live Chrome SSE/polling fallback not tested |
| New Experiment: browser reload job recovery (`sessionStorage`) | N/A | `NOT TESTED` | **`NOT TESTED`** | Requires live browser reload mid-experiment |
| Experiment Results: data loading, 4 chart tabs, accessibility tables, filtering/sorting/pagination | `PASS` (API payloads) | `NOT TESTED` | **`PARTIAL`** | `/api/experiments/{id}/results` verified on all 4 stored IDs; interactive table/chart tabs not tested in browser |
| Exports: CSV and JSON API endpoints | `PASS` | `NOT TESTED` | **`PARTIAL`** | `/api/exports/conf_seed42_n20/csv` (`200`, `19122` bytes) & `/json` (`200`, `6217` bytes) verified read-only; browser download triggers & chart PNG exports not tested |
| Experiment History: all experiments, incomplete/corrupted states, refresh, Load into Active | `PASS` | `NOT TESTED` | **`PARTIAL`** | `/api/history` lists all 4 experiments; `test_history_incomplete_corrupted_and_legacy_import_idempotency` passed; UI actions not tested in browser |
| Experiment Comparison: compatible/incompatible checks, matching-epsilon filtering | `PASS` | `NOT TESTED` | **`PARTIAL`** | `/api/comparison` tested for `(conf_seed42_n20, evaluation_seed39_n100)` and `(dev_seed42_n5, evaluation_seed39_n100)` returning exact matching epsilons and notices |
| Responsive layout (Desktop / Tablet / Mobile), drawers, dialogs, focus, console & network errors | N/A | `NOT TESTED` | **`NOT TESTED`** | Blocked by missing Chrome DevTools remote debugging port |
| Data Integrity Preservation | `PASS` | N/A | **`PASS`** | Pre-test and post-test SHA-256 hashes match identically across all 25 files (`results/` + `saved_model.pth`) |
| Numerical Parity with Python Engine & L4-Only Default | `PASS` | N/A | **`PASS`** | Exact `0.00e+00` diff on `/api/verification`, `<= 7.11e-15` vs historical CSVs, `layer_index == 4` (`10` targets) default confirmed |
| Frontend Build & Lint (`npm run lint`, `npm run build`) | `PASS` | N/A | **`PASS`** | ESLint: 0 errors/warnings; `tsc -b && vite build`: exit 0 (`8.86s`) |
| Python Regression Suite (`pytest`) | `PASS` | N/A | **`PASS`** | `697 passed, 1 warning in 25.81s` |

---

## 4. Data Integrity Comparison

Before and after all Phase 5 commands, every file under `results/` (`24` files) plus `saved_model.pth` (`1` file) was hashed with SHA-256. No isolated Phase 5 browser test run was executed (because browser testing was blocked), and zero historical files were added, modified, or deleted.

### Existing Experiment Inventory & Summaries

| Experiment ID | Folder | Type | Samples | Epsilons | Seed | Status | Notable Key Summary Data |
| :--- | :--- | :--- | :---: | :--- | :---: | :--- | :--- |
| `20261127_192338_6425e0` | `results\experiments\experiment_20261127_192338_6425e0` | `configured` | 11 | `[0.01, 0.03, 0.05, 0.1]` | 42 | `Completed` | Name: `"1st exp"`; eps=0.01 Base 0% / Ref 90.91% (`10/11`), eps=0.03 Base 0% / Ref 27.27% (`3/11`), eps=0.05 & 0.1 Ref 0% |
| `evaluation_seed39_n100` | `results\experiments\experiment_evaluation_seed39_n100` | `configured` | 100 | `[0.01, 0.03, 0.05, 0.1]` | 39 | `Completed` | eps=0.01 Base 5% / Ref 90% (`+85.0 pp`, width `13.54 -> 2.34`); eps=0.03 Base 0% / Ref 13% (`+13.0 pp`, width `36.88 -> 9.70`) |
| `dev_seed42_n5` | `results\experiments\experiment_dev_seed42_n5` | `development` | 5 | `[0.03]` | 42 | `Completed` | eps=0.03 Base 0% (`5` inconcl) / Ref 0% (`5` inconcl), mean output width `32.49 -> 9.575` (`-70.7%`) |
| `conf_seed42_n20` | `results\experiments\experiment_conf_seed42_n20` | `configured` | 20 | `[0.01, 0.03, 0.05, 0.1]` | 42 | `Completed` | Imported legacy 20-sample configured run (`csv`: `19122` B, `summary.json`: `6217` B) |
| `equivalence_seed39_n100_20261113_043645_1214a0` | `results\equivalence_seed39_n100_*` (flat) | `equivalence_validation` | 100 | `[0.01, 0.03, 0.05, 0.1]` | 39 | `Equivalent` | `400/400` pairs complete; `max_lower_diff=0.0`, `max_upper_diff=0.0`, `max_margin_diff=0.0`, `verdict_mismatches=0`; `6.54x` mean / `7.29x` median speedup |

### Pre-Test vs. Post-Test SHA-256 Integrity Table (`25 / 25` Files Unchanged)

| Relative Path | Size (Bytes) | Pre-Test & Post-Test SHA-256 Hash | Match |
| :--- | :---: | :--- | :---: |
| `.\results\equivalence_seed39_n100_samples.csv` | 408246 | `881C14A4A1172AAE283CEE09E270DA81835D9C261CF372EE463EC78E7AA5C4DB` | IDENTICAL |
| `.\results\equivalence_seed39_n100_summary.json` | 6170 | `20B474158D92B2AD0E23EF2ECDF78F30C62FD3FB04ABE878FBD165FD5A136164` | IDENTICAL |
| `.\results\evaluation_seed39_n100_samples.csv` | 94089 | `DBCCC6B6841EB6C7D9476F2A0214EC3DD9572815A5B30EB8A284833B5C5F43F6` | IDENTICAL |
| `.\results\evaluation_seed39_n100_summary.json` | 6132 | `5CA223946706E4E52216245622E2626DCE3E3EEAEAA2126395744833FE58699C` | IDENTICAL |
| `.\results\evaluation_seed42_n20_samples.csv` | 19122 | `4F1F681C8DD456AD588BB9744FE0422052722EE4C14CA913798F0A953F547F29` | IDENTICAL |
| `.\results\evaluation_seed42_n20_summary.json` | 6064 | `2B387680BF32FAA153FCE0A0E7BCB7CA7A1D6DA23C3755CE4BC76D13826C501D` | IDENTICAL |
| `.\results\evaluation_seed42_n5_samples.csv` | 1564 | `911496679A02FBF7F83F42FF1444BCE2B323137037DC3AB30BDE6B9BFFCF06F1` | IDENTICAL |
| `.\results\evaluation_seed42_n5_summary.json` | 2134 | `9490424083AA5F41053F2BC3BD1D1950C5E7428238C53A4FC23BC624F49146E3` | IDENTICAL |
| `.\results\experiments\experiment_20261127_192338_6425e0\config.json` | 565 | `99FA4CABB942F97C27D866248A86A2CD466D26D6CF66CB8B1C12FAC5B1720B0A` | IDENTICAL |
| `.\results\experiments\experiment_20261127_192338_6425e0\samples.csv` | 10725 | `2683742A09C6A80E85DC3A7FC9BCE3D5F93832AC64DC93DFADDF48223727AF9F` | IDENTICAL |
| `.\results\experiments\experiment_20261127_192338_6425e0\summary.json` | 6303 | `894BA2458A7EB5525C463E1926E83B3D8BF43E1F8217FDFE63B4C296B192FE6B` | IDENTICAL |
| `.\results\experiments\experiment_conf_seed42_n20\config.json` | 572 | `A2CF86DE37C1BC80B75CF36B01C0A237E644BF8C771A35265D44C26229C12868` | IDENTICAL |
| `.\results\experiments\experiment_conf_seed42_n20\samples.csv` | 19122 | `4F1F681C8DD456AD588BB9744FE0422052722EE4C14CA913798F0A953F547F29` | IDENTICAL |
| `.\results\experiments\experiment_conf_seed42_n20\summary.json` | 6217 | `3A97006DDAC6EEFB005712CBE5BA861CB0E82D0616E78E184E9BB3E8C6798457` | IDENTICAL |
| `.\results\experiments\experiment_dev_seed42_n5\config.json` | 537 | `44C194915A20C84B4BE50695A45B01A892A181AFAD771F875DCC08E430034E7B` | IDENTICAL |
| `.\results\experiments\experiment_dev_seed42_n5\samples.csv` | 1564 | `911496679A02FBF7F83F42FF1444BCE2B323137037DC3AB30BDE6B9BFFCF06F1` | IDENTICAL |
| `.\results\experiments\experiment_dev_seed42_n5\summary.json` | 2286 | `B13E2EBF7F14F93A20F094C3848296AFA82F9EB96A8F25A9A68B02B3D680A830` | IDENTICAL |
| `.\results\experiments\experiment_evaluation_seed39_n100\config.json` | 581 | `8962BAF4E79F6F5E6974F711A4FB9EA0D6BC771DFBE83875C90282AEEA8CDD55` | IDENTICAL |
| `.\results\experiments\experiment_evaluation_seed39_n100\samples.csv` | 94089 | `DBCCC6B6841EB6C7D9476F2A0214EC3DD9572815A5B30EB8A284833B5C5F43F6` | IDENTICAL |
| `.\results\experiments\experiment_evaluation_seed39_n100\summary.json` | 6292 | `CEDD2F902B06030AF8CECC2AC9F6CFF16B7005EF35E767A37B74413FF2D02172` | IDENTICAL |
| `.\results\smoke_n3_e01_samples.csv` | 1088 | `0E56CAB6D957EA91BEB3B0E9CE81FE81CBDD2943C3FB8EA7F8C2F9AB65EC6E4E` | IDENTICAL |
| `.\results\smoke_n3_e01_summary.json` | 2086 | `0EDDC04F53208985D33DD57312A87FEDC2E53217985EDE2CED242A8D8597520B` | IDENTICAL |
| `.\results\smoke_n3_samples.csv` | 1089 | `FA5497CC996918FDADE494728A90A0C6A8D7C01DBEA9D69486855770DFEBF1AB` | IDENTICAL |
| `.\results\smoke_n3_summary.json` | 2080 | `446E9F0DFFF686018C30C5894779684E487DABFCF369758E661D97B3DDA6AD26` | IDENTICAL |
| `.\saved_model.pth` | 213701 | `0656B8F3EB283502125CE6839192562B317DFBF7E0449063C69B49030C326C79` | IDENTICAL |

`git status --short` confirms only Phase 2–4 migration files (`M .gitignore`, `M README.md`, `M evaluation/experiment.py`, `M requirements.txt`, `?? BACKEND_API.md`, `?? REACT_MIGRATION_AUDIT.md`, `?? backend/`, `?? frontend/`, `?? tests/test_backend_api.py`) plus this report are present; `dashboard/` and all research artifacts are untouched.

---

## 5. Numerical Parity Checks

Because live Chrome inspection was unavailable, numerical parity was validated directly between FastAPI `POST /api/verification` (`TestClient`), `dashboard.services` (`run_baseline_verification`, `run_refined_verification`), stored `samples.csv` rows, and direct verification engine calls (`verify_robustness`, `propagate_network`, `verify_robustness_refined`). **Frontend DOM formatting/display parity could not be directly verified (`NOT TESTED`).**

### Live Engine vs. `POST /api/verification` vs. `dashboard.services` (`MiniCertNet`, L4-Only Default)

| Sample Index | True / Pred Class | Epsilon | Baseline Status & Margin | Refined Status & Margin | Target Layer(s) & Count | Accepted | Max Margin / Bound Abs Diff (API vs. Engine) |
| :---: | :---: | :---: | :--- | :--- | :---: | :---: | :---: |
| `0` | `7` / `7` | `0.01` | `INCONCLUSIVE` (`-7.539167`) | `CERTIFIED` (`+3.773888`) | `[4]` (`10`) | `10` | `0.00e+00` |
| `0` | `7` / `7` | `0.03` | `INCONCLUSIVE` (`-32.076615`) | `INCONCLUSIVE` (`-5.925530`) | `[4]` (`10`) | `10` | `0.00e+00` |
| `1` | `2` / `2` | `0.01` | `INCONCLUSIVE` (`-5.276917`) | `CERTIFIED` (`+3.320196`) | `[4]` (`10`) | `10` | `0.00e+00` |
| `1` | `2` / `2` | `0.03` | `INCONCLUSIVE` (`-23.336240`) | `INCONCLUSIVE` (`-1.396598`) | `[4]` (`10`) | `10` | `0.00e+00` |
| `5` | `1` / `1` | `0.01` | `INCONCLUSIVE` (`-10.862020`) | `CERTIFIED` (`+2.530886`) | `[4]` (`10`) | `10` | `0.00e+00` |
| `5` | `1` / `1` | `0.03` | `INCONCLUSIVE` (`-41.694342`) | `INCONCLUSIVE` (`-11.006263`) | `[4]` (`10`) | `10` | `0.00e+00` |

- **L4-only refinement default confirmed:** `verify_robustness_refined` defaults to `include_hidden_relu=False`, refining strictly output layer `[4]` (`10` target neurons, all `10` tightened/accepted on all six checks).
- **Per-class bounds checked:** Across all 10 classes on every test point (for example, sample `0`, `epsilon=0.01`: class `0` `[-9.9447, 3.0262]` -> `[-4.1217, -2.1707]`, target class `7` `[-1.1749, 14.5161]` -> `[5.4892, 8.4911]`), maximum difference between API bounds and direct Python engine bounds was `0.00e+00`.

### Stored Experiment CSV Spot-Check vs. Current Direct L4-Only Engine

| Stored Experiment | Sample Index | Epsilon | Pred | Base Margin (CSV) | Base Diff vs. Engine | Ref Margin (CSV) | Ref Diff vs. Engine | CSV Targets vs. Current L4 Engine Targets |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `experiment_dev_seed42_n5` | `3771` | `0.03` | `8` | `-39.10809807575457` | `0.00e+00` | `-9.101576427939456` | `7.11e-15` | `61` (legacy hidden+L4) vs. `10` (L4-only) |
| `experiment_dev_seed42_n5` | `6672` | `0.03` | `0` | `-22.79298236850895` | `0.00e+00` | `-1.6288833097020197` | `2.66e-15` | `47` (legacy hidden+L4) vs. `10` (L4-only) |
| `experiment_evaluation_seed39_n100` | `5405` | `0.01` | `0` | `-3.392658703353252` | `0.00e+00` | `5.714207775699728` | `2.66e-15` | `12` (legacy hidden+L4) vs. `10` (L4-only) |
| `experiment_evaluation_seed39_n100` | `5026` | `0.01` | `9` | `-10.255969830309883` | `0.00e+00` | `1.500930326745987` | `1.78e-15` | `26` (legacy hidden+L4) vs. `10` (L4-only) |
| `experiment_20261127_192338_6425e0` | `3771` | `0.01` | `8` | `-13.299556148790376` | `0.00e+00` | `1.1886218180764523` | `0.00e+00` | `10` vs. `10` |
| `experiment_20261127_192338_6425e0` | `6672` | `0.01` | `0` | `-2.9590469326746582` | `0.00e+00` | `5.116087871518109` | `0.00e+00` | `10` vs. `10` |

This confirms both historical numerical continuity (`<= 7.11e-15`) and that newly created backend runs (`20261127_192338_6425e0`) preserve L4-only refinement (`10` targets) with exact `0.00e+00` parity.

---

## 6. Responsive Design Results

All responsive and live browser UI interaction checks are **`NOT TESTED`** due to Chrome DevTools MCP blockage (`DevToolsActivePort` missing):

- Desktop viewport layout: `NOT TESTED`
- Tablet viewport layout: `NOT TESTED`
- Mobile viewport layout and collapsible sidebar drawer: `NOT TESTED`
- Horizontal overflow checks on tables, charts, forms, dialogs, and dropdowns: `NOT TESTED`
- Keyboard focus order and focus-visible rings: `NOT TESTED`
- Rendered loading, error, and empty UI states: `NOT TESTED`
- Browser console errors/warnings and browser-observed HTTP `>= 400` network requests: `NOT TESTED`

---

## 7. Frontend Build and Lint Results

Commands executed in `frontend/`:

| Check | Command | Exit Code | Result |
| :--- | :--- | :---: | :--- |
| ESLint | `npm run lint` (`eslint .`) | `0` | **`PASS`** — `0` errors, `0` warnings |
| TypeScript + Vite Build | `npm run build` (`tsc -b && vite build`) | `0` | **`PASS`** — `vite v7.3.8`, `2614` modules transformed in `8.86s` (`dist/index.html` `0.78 kB`, `dist/assets/index-D-V6bihR.css` `27.97 kB`, `dist/assets/index-Dui0hO1w.js` `1,103.54 kB`) |

- Vite build emits a non-blocking chunk size warning (`> 500 kB` minified JS chunk for `index-Dui0hO1w.js`) because route components and Recharts are bundled in a single entry chunk.

---

## 8. Python Regression Results

1. **Full Test Suite:**  
   Command: `.\venv\Scripts\python.exe -m pytest -p no:cacheprovider tests/ -q`  
   Result: **`PASS` — `697 passed, 1 warning in 25.81s`** (0 failed, 0 skipped).
2. **Backend API Focused Run:**  
   Command: `.\venv\Scripts\python.exe -m pytest -p no:cacheprovider tests/test_backend_api.py -v`  
   Result: **`PASS` — `11 passed, 1 warning in 19.89s`**:
   - `test_health_and_startup_resources_cached_once`
   - `test_startup_failure_reports_unhealthy_503`
   - `test_dynamic_model_architecture_and_overview`
   - `test_sample_preview_and_validation`
   - `test_individual_verification_numerical_parity_with_engine`
   - `test_experiment_background_execution_sse_and_polling_and_persistence`
   - `test_failed_experiment_does_not_stay_running`
   - `test_history_incomplete_corrupted_and_legacy_import_idempotency`
   - `test_comparison_and_read_only_exports`
   - `test_progress_callback_preserves_exact_experiment_parity`
   - `test_sse_client_disconnect_cleanup`
3. **Observed Warning:** `StarletteDeprecationWarning` in `venv\Lib\site-packages\fastapi\testclient.py` (`httpx2` dependency note).

---

## 9. Known Bugs and Limitations

1. **Unverified Live Browser Behavior (Phase 5 Audit Gap):** Chrome DevTools MCP (`DevToolsActivePort` ENOENT) prevented live verification of React rendering, Recharts layouts, TanStack Table sorting/pagination, SSE/polling fallback in browser, `sessionStorage` reload recovery, file download UX, responsive breakpoints, keyboard navigation, and console/network error checks.
2. **Default Environment File Configuration (`frontend/.env` absent):** Only `frontend/.env.example` exists (`VITE_API_BASE_URL=http://127.0.0.1:8000`). In dev mode without `.env`, frontend traffic uses the Vite `/api` proxy (same-origin) rather than testing direct cross-origin requests from `http://127.0.0.1:5173` to `http://127.0.0.1:8000`. Non-Vite static hosting of `dist/` would require configuring either `VITE_API_BASE_URL` at build time or a reverse proxy for `/api`.
3. **Single-Process, Single-Worker Experiment Runner:** `backend/jobs/manager.py` uses `ThreadPoolExecutor(max_workers=1)` and in-memory job state tracking. Long-running experiments queue sequentially and require single-worker Uvicorn deployment so status/SSE streams stay consistent in memory.
4. **Large Single-Bundle Frontend Chunk:** Production JS build (`1,103.54 kB`) is above Vite's default `500 kB` chunk advisory because lazy route code-splitting (`React.lazy`) and `manualChunks` are not configured.
5. **Untouched Legacy Streamlit App:** `dashboard/app.py` and its dependencies remain in place per Phase 5 boundaries.

---

## 10. Streamlit Retirement Recommendation

**Recommendation: DO NOT RETIRE STREAMLIT YET (`NO-GO` for retirement).**

Although every automated backend, data integrity, numerical parity, build/lint, and Python regression gate passed cleanly (`697/697` tests passing, `0.00e+00` API vs. engine verification difference, `0` lint/TypeScript errors, `25/25` artifact hashes unchanged), **the core Phase 5 requirement of live browser-based acceptance across all six React pages and desktop/tablet/mobile viewports remains `NOT TESTED`**.

### Conditions Required Before Approving Streamlit Retirement

1. Run a live browser session (after enabling `chrome://inspect/#remote-debugging` in Google Chrome or conducting an audited manual/Playwright UI walkthrough) covering all 6 routes (`/`, `/verify`, `/experiments/new`, `/experiments/results`, `/experiments/history`, `/experiments/compare`).
2. Confirm in-browser SSE progress, polling fallback behavior, reload recovery (`sessionStorage`), invalid-form feedback, client verification cache reuse, chart PNG & table CSV/JSON downloads, responsive Desktop/Tablet/Mobile layout without horizontal clipping, and zero console errors / unexpected failed network requests (`>= 400`).
3. Verify direct cross-origin `VITE_API_BASE_URL` behavior if deploying frontend/backend separately outside Vite's `/api` dev proxy.
4. Only after those `NOT TESTED` gates transition to `PASS` should `dashboard/app.py` and Streamlit dependencies be removed in a dedicated cleanup step.

# MiniCert React Frontend

React + TypeScript + Vite research frontend for MiniCert (Phase 3 foundation).

## Setup & Development

1. Start the FastAPI backend from the repository root:
   ```powershell
   .\venv\Scripts\uvicorn.exe backend.main:app --host 127.0.0.1 --port 8000 --reload
   ```
2. Configure environment variables in `frontend/`:
   ```powershell
   copy .env.example .env
   ```
   `VITE_API_BASE_URL` configures the backend origin (e.g. `http://127.0.0.1:8000`). If unset, Vite proxies `/api` requests to `http://127.0.0.1:8000`.
3. Install dependencies and run the dev server:
   ```powershell
   npm install
   npm run dev
   ```
4. Type-check, lint, and build:
   ```powershell
   npm run lint
   npm run build
   ```

---
description: Start TripSathi backend (FastAPI/uvicorn) and frontend (Vite) for local development. Use when asked to start the app, run locally, or bring up dev servers.
---

# dev-start skill

Start both services for local development. Follow every step exactly — the ordering and PowerShell forms below are proven to work on this Windows 11 machine.

## Preflight checks (run in parallel)

Before launching, verify prerequisites are in place:

```powershell
# 1 — backend venv exists
Test-Path D:\Workspace\Agent\backend\venv\Scripts\uvicorn.exe

# 2 — backend .env exists
Test-Path D:\Workspace\Agent\backend\.env

# 3 — frontend node_modules exists
Test-Path D:\Workspace\Agent\frontend\node_modules
```

**If any check fails:**
- Missing venv: tell the user to run `cd backend && python -m venv venv && venv\Scripts\pip install -r requirements.txt`
- Missing .env: tell the user to create `backend/.env` with keys: `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`, `RESEARCH_MODEL`, `TAVILY_API_KEY`, `OPENWEATHER_API_KEY`, `GOOGLE_MAPS_API_KEY`, `UNSPLASH_ACCESS_KEY`
- Missing node_modules: tell the user to run `cd frontend && npm install`

Stop here and report — do not attempt to launch if prerequisites are missing.

## Step 1 — Start backend

```powershell
cd D:\Workspace\Agent\backend
Start-Process `
  -NoNewWindow `
  -FilePath ".\venv\Scripts\uvicorn.exe" `
  -ArgumentList "main:app","--host","0.0.0.0","--port","8000","--reload" `
  -RedirectStandardOutput "$env:TEMP\tripsathi_backend_out.txt" `
  -RedirectStandardError  "$env:TEMP\tripsathi_backend_err.txt" `
  -PassThru | Select-Object Id
```

Wait 4 seconds, then read logs:

```powershell
Start-Sleep -Seconds 4
Get-Content "$env:TEMP\tripsathi_backend_out.txt" -ErrorAction SilentlyContinue
Get-Content "$env:TEMP\tripsathi_backend_err.txt" -ErrorAction SilentlyContinue
```

**Success signal:** log contains `Application startup complete.`  
**Failure signal:** any Python traceback. Read the error, report it — do not proceed to Step 2.

## Step 2 — Start frontend

```powershell
cd D:\Workspace\Agent\frontend
Start-Process `
  -NoNewWindow `
  -FilePath "cmd.exe" `
  -ArgumentList "/c","npm run dev" `
  -RedirectStandardOutput "$env:TEMP\tripsathi_frontend_out.txt" `
  -RedirectStandardError  "$env:TEMP\tripsathi_frontend_err.txt" `
  -PassThru | Select-Object Id
```

Wait 5 seconds, then read logs:

```powershell
Start-Sleep -Seconds 5
Get-Content "$env:TEMP\tripsathi_frontend_out.txt" -ErrorAction SilentlyContinue
Get-Content "$env:TEMP\tripsathi_frontend_err.txt" -ErrorAction SilentlyContinue
```

**Success signal:** log contains `Local:   http://localhost:5173`  
**Failure signal:** npm error or port conflict. Report the error.

## Step 3 — Confirm and report

Once both are up, report to the user:

```
Backend:  http://localhost:8000   (FastAPI + uvicorn, --reload active)
Frontend: http://localhost:5173   (Vite dev server)

Logs:
  Backend  → %TEMP%\tripsathi_backend_out.txt / tripsathi_backend_err.txt
  Frontend → %TEMP%\tripsathi_frontend_out.txt / tripsathi_frontend_err.txt
```

## Key gotchas (do not re-discover these)

- **Never** use `Start-Process -FilePath "npm"` directly — PowerShell 5.1 on Windows cannot spawn npm as a Win32 app. Always wrap in `cmd.exe /c`.
- **Never** use system Python or pip — always `.\venv\Scripts\uvicorn.exe` and `.\venv\Scripts\python.exe`.
- **Never** use `-RedirectStandardError "2>&1"` syntax — PowerShell 5.1 wraps native stderr as ErrorRecords; redirect to a separate file instead.
- The Vite proxy forwards `/api/*` → `http://localhost:8000` (configured in `frontend/vite.config.ts`). No CORS config needed for local dev.
- HuggingFace embedding model (`BAAI/bge-small-en-v1.5`) loads from cache on startup — expect a `Loading weights` line in backend logs, that's normal.

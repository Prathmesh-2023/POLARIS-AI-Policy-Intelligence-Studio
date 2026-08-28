from __future__ import annotations

import asyncio
import os
import secrets
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

import db
import ev_model
from models import (
    ComparePolicyVariant,
    CompareRequest,
    CreateRunRequest,
    CreateRunResponse,
    HealthResponse,
    new_run_payload,
)
from pipeline import STALE_RUN_SECONDS, run_pipeline

# backend/.env is the source of truth in local dev, so let it override any
# stale GROQ_API_KEY left in the shell environment (a common 401 cause).
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)
load_dotenv()


def _env_flag(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int, *, minimum: int = 1) -> int:
    try:
        return max(minimum, int(float(os.getenv(name) or default)))
    except (TypeError, ValueError):
        return default


# Owner-only gate for the Reports history. When POLARIS_ADMIN_KEY is set, listing
# and deleting runs require a matching `x-admin-key` header; when it is unset the
# endpoints stay open (local-dev convenience). Set it before deploying to hide the
# report history from end users. Single-run GET stays public so a user can still
# poll and view their own just-submitted analysis.
ADMIN_KEY = os.getenv("POLARIS_ADMIN_KEY", "").strip()

# Analysis costs LLM quota, so starting a run can be gated. When enabled, a caller
# must either present the owner key or bring their own Groq key — nobody can spend
# the server's GROQ_API_KEY anonymously. Defaults ON whenever an owner key is
# configured (i.e. a real deployment) and OFF for local development.
REQUIRE_KEY_FOR_RUNS = _env_flag("POLARIS_REQUIRE_KEY_FOR_RUNS", bool(ADMIN_KEY))

# Per-IP cap on new runs, so an open instance can't be drained by a loop.
RUNS_PER_HOUR = _env_int("POLARIS_RUNS_PER_HOUR", 20)

# CORS: a comma-separated allowlist for deployment. Unset means "any origin",
# which is fine locally but should be pinned once the frontend has a real host.
_origins_raw = (os.getenv("POLARIS_ALLOWED_ORIGINS") or "").strip()
ALLOWED_ORIGINS = [o.strip() for o in _origins_raw.split(",") if o.strip()] or ["*"]


def _require_admin(x_admin_key: str | None) -> None:
    # compare_digest keeps the check constant-time, so a wrong key leaks nothing
    # about how much of it was right.
    if ADMIN_KEY and not secrets.compare_digest((x_admin_key or ""), ADMIN_KEY):
        raise HTTPException(status_code=401, detail="Owner access required")


def _is_admin(x_admin_key: str | None) -> bool:
    return bool(ADMIN_KEY) and secrets.compare_digest((x_admin_key or ""), ADMIN_KEY)


def _client_ip(request: Request) -> str:
    # Behind a platform proxy the first X-Forwarded-For hop is the real client.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


_run_hits: dict[str, deque[float]] = defaultdict(deque)


def _check_rate_limit(ip: str) -> None:
    now = time.monotonic()
    hits = _run_hits[ip]
    while hits and now - hits[0] > 3600:
        hits.popleft()
    if len(hits) >= RUNS_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Rate limit reached ({RUNS_PER_HOUR} analyses per hour). "
                "Add your own Groq API key in Settings, or try again later."
            ),
        )
    hits.append(now)
    if len(_run_hits) > 2048:  # bound the bookkeeping on a long-lived process
        for key in [k for k, v in _run_hits.items() if not v]:
            _run_hits.pop(key, None)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await db.init_db()
    # Anything left mid-flight belongs to a process that no longer exists.
    await db.sweep_stale_runs(0)
    yield


app = FastAPI(title="POLARIS Backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post("/api/runs", response_model=CreateRunResponse)
async def create_run(
    body: CreateRunRequest,
    background: BackgroundTasks,
    request: Request,
    x_groq_key: str | None = Header(default=None),
    x_admin_key: str | None = Header(default=None),
) -> CreateRunResponse:
    policy_text = body.policy_text.strip()
    if not policy_text:
        raise HTTPException(status_code=422, detail="policy_text is required")
    # A user's own Groq key (from Settings) is threaded into the pipeline for this
    # run only. It is never written to the run payload, so it can't leak back out
    # through the public GET /api/runs/{id}.
    user_key = (x_groq_key or "").strip() or None
    owner = _is_admin(x_admin_key)
    if REQUIRE_KEY_FOR_RUNS and not owner and not user_key:
        raise HTTPException(
            status_code=401,
            detail=(
                "Starting an analysis requires your own Groq API key. Add one in "
                "Settings — it is used for your request only and never stored."
            ),
        )
    if not owner:
        _check_rate_limit(_client_ip(request))
    run_id = str(uuid.uuid4())
    await db.save_run(new_run_payload(run_id, policy_text, body.domain_hint, body.lever_overrides))
    background.add_task(run_pipeline, run_id, user_key)
    return CreateRunResponse(run_id=run_id)


@app.get("/api/admin/check")
async def admin_check(x_admin_key: str | None = Header(default=None)) -> dict:
    """Report whether an owner gate is configured and whether the supplied key is valid.
    Lets the frontend show/hide the Reports section and drive the unlock flow."""
    configured = bool(ADMIN_KEY)
    return {
        "configured": configured,
        "ok": (not configured) or _is_admin(x_admin_key),
        # Lets the UI ask for a Groq key up front instead of failing on submit.
        "requires_key_for_runs": REQUIRE_KEY_FOR_RUNS,
    }


@app.get("/api/runs")
async def list_runs(
    limit: int = 50, x_admin_key: str | None = Header(default=None)
) -> list[dict]:
    """Compact history of past analyses, newest first, for the Reports view."""
    _require_admin(x_admin_key)
    await db.sweep_stale_runs(STALE_RUN_SECONDS)
    return await db.list_runs(max(1, min(limit, 200)))


@app.delete("/api/runs")
async def delete_all_runs(x_admin_key: str | None = Header(default=None)) -> dict:
    """Clear the entire run history (owner only)."""
    _require_admin(x_admin_key)
    count = await db.delete_all_runs()
    return {"deleted_count": count}


@app.delete("/api/runs/{run_id}")
async def delete_run(
    run_id: str, x_admin_key: str | None = Header(default=None)
) -> dict:
    """Delete a single run from the history (owner only)."""
    _require_admin(x_admin_key)
    if not await db.delete_run(run_id):
        raise HTTPException(status_code=404, detail="run not found")
    return {"deleted": run_id}


@app.get("/api/runs/{run_id}")
async def get_run(run_id: str) -> dict:
    payload = await db.get_run(run_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="run not found")
    # Cheap watchdog on the polling path: a run whose row hasn't moved in the whole
    # stale window belongs to a process that died, so retire it instead of letting
    # the dashboard poll a status that will never change. The SQL filters on
    # updated_at, so the usual case touches no payloads.
    if payload.get("status") in db.IN_FLIGHT_STATUSES:
        if run_id in await db.sweep_stale_runs(STALE_RUN_SECONDS):
            refreshed = await db.get_run(run_id)
            if refreshed is not None:
                return refreshed
    return payload


def _variant_to_policy(v: ComparePolicyVariant) -> dict:
    """Turn an A/B variant into the minimal parsed-policy shape run_model expects."""
    return {
        "timeline_years": v.horizon_years or 5,
        "levers": {
            "incentive_strength": (v.incentive_strength or "medium").lower(),
            "infrastructure_push": (v.infrastructure_push or "low").lower(),
            "target_penetration_pct": v.target_penetration_pct,
        },
    }


@app.post("/api/model/compare")
async def compare_model(body: CompareRequest) -> dict:
    """A/B compare two EV-policy designs on the quantitative projection alone.

    No LLM and no persisted run — the diffusion projection is cheap, so this returns
    both scenarios plus their per-state delta synchronously for a live side-by-side.
    EV-transport only (the only domain with a calibrated quantitative model)."""
    policy_a = _variant_to_policy(body.a)
    policy_b = _variant_to_policy(body.b)
    result = await asyncio.to_thread(ev_model.compare_policies, policy_a, policy_b)
    result["labels"] = {
        "a": body.a.label or "Variant A",
        "b": body.b.label or "Variant B",
    }
    return result

from __future__ import annotations

import asyncio
import json
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent / "polaris.db"

_lock = asyncio.Lock()
_initialized = False


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_sync() -> None:
    conn = _connect()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        # Modification Notes #12 — binds the dashboard heatmap to real model output.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS model_predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                domain TEXT,
                model_name TEXT,
                support_level TEXT,
                state TEXT,
                baseline_value REAL,
                predicted_value REAL,
                policy_effect REAL,
                ci_lower REAL,
                ci_upper REAL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


async def init_db() -> None:
    global _initialized
    async with _lock:
        if _initialized:
            return
        await asyncio.to_thread(_init_sync)
        _initialized = True


def _get_sync(run_id: str) -> dict[str, Any] | None:
    conn = _connect()
    try:
        row = conn.execute("SELECT payload FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        return json.loads(row["payload"])
    finally:
        conn.close()


def _save_sync(payload: dict[str, Any]) -> None:
    conn = _connect()
    try:
        encoded = json.dumps(payload)
        conn.execute(
            """
            INSERT INTO runs (run_id, payload, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(run_id) DO UPDATE SET
                payload = excluded.payload,
                updated_at = datetime('now')
            """,
            (payload["run_id"], encoded),
        )
        conn.commit()
    finally:
        conn.close()


async def get_run(run_id: str) -> dict[str, Any] | None:
    await init_db()
    async with _lock:
        return await asyncio.to_thread(_get_sync, run_id)


async def save_run(payload: dict[str, Any]) -> None:
    await init_db()
    async with _lock:
        await asyncio.to_thread(_save_sync, payload)


async def patch_run(run_id: str, mutator) -> dict[str, Any]:
    """Load, mutate, persist under the DB lock. mutator(payload) -> None."""
    await init_db()
    async with _lock:
        payload = await asyncio.to_thread(_get_sync, run_id)
        if payload is None:
            raise KeyError(run_id)
        mutator(payload)
        await asyncio.to_thread(_save_sync, payload)
        return payload


def _summarize(payload: dict[str, Any]) -> dict[str, Any]:
    """Compact a stored run payload down to the fields the Reports list needs."""
    synthesis = payload.get("synthesis") or {}
    parsed = payload.get("parsed_policy") or {}
    classification = payload.get("classification") or {}
    text = (payload.get("policy_input") or {}).get("policy_text") or ""
    return {
        "run_id": payload.get("run_id"),
        "status": payload.get("status"),
        "policy_text": text,
        "domain": parsed.get("domain") or classification.get("label"),
        "verdict": synthesis.get("verdict"),
        "overall_impact_score": synthesis.get("overall_impact_score"),
        "risk_level": synthesis.get("risk_level"),
        "confidence": synthesis.get("confidence"),
    }


def _list_sync(limit: int) -> list[dict[str, Any]]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT payload, created_at, updated_at FROM runs "
            "ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for row in rows:
            try:
                summary = _summarize(json.loads(row["payload"]))
            except (ValueError, TypeError):
                continue
            summary["created_at"] = row["created_at"]
            summary["updated_at"] = row["updated_at"]
            out.append(summary)
        return out
    finally:
        conn.close()


async def list_runs(limit: int = 50) -> list[dict[str, Any]]:
    await init_db()
    async with _lock:
        return await asyncio.to_thread(_list_sync, limit)


def _delete_sync(run_id: str) -> bool:
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM runs WHERE run_id = ?", (run_id,))
        conn.execute("DELETE FROM model_predictions WHERE run_id = ?", (run_id,))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


async def delete_run(run_id: str) -> bool:
    """Remove a single run (and its model_predictions). Returns True if it existed."""
    await init_db()
    async with _lock:
        return await asyncio.to_thread(_delete_sync, run_id)


def _delete_all_sync() -> int:
    conn = _connect()
    try:
        cur = conn.execute("DELETE FROM runs")
        conn.execute("DELETE FROM model_predictions")
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


async def delete_all_runs() -> int:
    """Clear the entire run history. Returns the number of runs removed."""
    await init_db()
    async with _lock:
        return await asyncio.to_thread(_delete_all_sync)


def _save_model_predictions_sync(run_id: str, model: dict[str, Any]) -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM model_predictions WHERE run_id = ?", (run_id,))
        rows = [
            (
                run_id,
                model.get("domain"),
                model.get("model_name"),
                model.get("support_level"),
                s.get("state"),
                s.get("baseline_value"),
                s.get("predicted_value"),
                s.get("policy_effect"),
                s.get("ci_lower"),
                s.get("ci_upper"),
            )
            for s in (model.get("states") or [])
        ]
        conn.executemany(
            """
            INSERT INTO model_predictions
                (run_id, domain, model_name, support_level, state,
                 baseline_value, predicted_value, policy_effect, ci_lower, ci_upper)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
        conn.commit()
    finally:
        conn.close()


async def save_model_predictions(run_id: str, model: dict[str, Any]) -> None:
    await init_db()
    async with _lock:
        await asyncio.to_thread(_save_model_predictions_sync, run_id, model)


# --- Stale-run watchdog ------------------------------------------------------
# A run is driven by an in-process background task. If the process is restarted
# (or the task dies without reaching its own error handler) the stored status is
# left mid-flight forever and the dashboard polls it indefinitely. This sweep
# retires those orphans. It is deliberately lazy — no timer thread; callers run
# it on startup and on read.
IN_FLIGHT_STATUSES = frozenset(
    {"queued", "parsing", "modeling", "fetching_data", "analyzing", "debating", "synthesizing"}
)

STALE_MESSAGE = (
    "The analysis stopped responding and was retired by the server watchdog "
    "(the backend may have restarted mid-run). Please run it again."
)


def _sweep_stale_sync(timeout_s: int) -> list[str]:
    conn = _connect()
    try:
        # Only rows untouched for longer than the timeout are candidates, so the
        # common case parses no payloads at all. A timeout of 0 means "every
        # in-flight run regardless of age" (used at startup, where any run still
        # mid-flight was orphaned by the previous process).
        if int(timeout_s) <= 0:
            rows = conn.execute("SELECT run_id, payload FROM runs").fetchall()
        else:
            rows = conn.execute(
                "SELECT run_id, payload FROM runs WHERE updated_at < datetime('now', ?)",
                (f"-{int(timeout_s)} seconds",),
            ).fetchall()
        retired: list[str] = []
        for row in rows:
            try:
                payload = json.loads(row["payload"])
            except (ValueError, TypeError):
                continue
            if payload.get("status") not in IN_FLIGHT_STATUSES:
                continue
            payload["status"] = "error"
            payload["error"] = STALE_MESSAGE
            conn.execute(
                "UPDATE runs SET payload = ?, updated_at = datetime('now') WHERE run_id = ?",
                (json.dumps(payload), row["run_id"]),
            )
            retired.append(str(row["run_id"]))
        if retired:
            conn.commit()
        return retired
    finally:
        conn.close()


async def sweep_stale_runs(timeout_s: int) -> list[str]:
    """Mark every in-flight run that hasn't been updated in `timeout_s` seconds as
    errored. Returns the run_ids retired."""
    await init_db()
    async with _lock:
        return await asyncio.to_thread(_sweep_stale_sync, timeout_s)

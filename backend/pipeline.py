from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx

import db
import ev_model
from domain_registry import classify_domain
from groq_client import GroqError, chat_json
from json_util import (
    normalize_debate_round,
    normalize_levers,
    normalize_multidim,
    normalize_parsed_policy,
    normalize_risk_output,
    normalize_synthesis,
)
from prompts import (
    DEBATE_ROUND1_SYSTEM,
    DEBATE_ROUND2_SYSTEM,
    MULTIDIM_SYSTEM,
    PARSER_SYSTEM,
    RISK_SYSTEM,
    SYNTHESIS_SYSTEM,
)
from worldbank import fetch_supporting_indicators

SEED_PATH = Path(__file__).resolve().parent / "state_seed_data.json"


def _env_int(name: str, default: int, *, minimum: int) -> int:
    try:
        return max(minimum, int(float(os.getenv(name) or default)))
    except (TypeError, ValueError):
        return default


# Wall-clock ceiling for one full analysis, and the (slightly longer) idle window
# after which the DB watchdog retires a run left in-flight by a dead process.
RUN_TIMEOUT_SECONDS = _env_int("POLARIS_RUN_TIMEOUT_SECONDS", 300, minimum=30)
STALE_RUN_SECONDS = _env_int("POLARIS_STALE_RUN_SECONDS", RUN_TIMEOUT_SECONDS + 30, minimum=60)


def _load_state_seed() -> dict[str, Any]:
    with SEED_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def _apply_lever_overrides(parsed: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    """Merge user-supplied lever overrides onto the parsed policy and re-normalize.
    `horizon_years` overrides the implementation timeline; the three strength
    levers override the parser's read. Flags the policy as user-adjusted."""
    merged = dict(parsed)
    levers = dict(merged.get("levers") or {})
    for key in ("incentive_strength", "infrastructure_push", "target_penetration_pct"):
        if overrides.get(key) is not None:
            levers[key] = overrides[key]
    merged["levers"] = normalize_levers(levers)
    horizon = overrides.get("horizon_years")
    if horizon is not None:
        try:
            merged["timeline_years"] = max(1, min(int(float(horizon)), 15))
        except (TypeError, ValueError):
            pass
    merged["levers_overridden"] = True
    return merged


# --- token-lean views for LLM prompts --------------------------------------
# Free-tier Groq keys have a small tokens-per-minute budget, so we send the LLM
# a compact projection of the evidence — the numbers it must reason over — and
# drop the token-heavy arrays (full per-state table, event study, mechanism
# chain, multi-year series). This keeps sequential calls under the TPM ceiling
# and is the main defence against cascading 429s.
def _slim_model_for_llm(model: dict[str, Any] | None) -> dict[str, Any] | None:
    if not model:
        return None
    states = model.get("states") or []
    ranked = sorted(states, key=lambda s: float(s.get("policy_effect") or 0.0), reverse=True)

    def _mv(s: dict[str, Any]) -> dict[str, Any]:
        return {
            "state": s.get("state"),
            "policy_effect": s.get("policy_effect"),
            "predicted_value": s.get("predicted_value"),
            "income_group": s.get("income_group"),
        }

    top = [_mv(s) for s in ranked[:6]]
    bottom = [_mv(s) for s in ranked[-4:]] if len(ranked) > 6 else []
    dist = model.get("distribution") or {}
    return {
        "model_name": model.get("model_name"),
        "method": model.get("method"),
        "outcome_label": model.get("outcome_label"),
        "unit": model.get("unit"),
        "policy_levers": model.get("policy_levers"),
        "headline": model.get("headline"),
        "causal": model.get("causal"),
        "fit": model.get("fit"),
        "by_income_group": dist.get("by_income_group"),
        "top_states": top,
        "bottom_states": bottom,
        "n_states": len(states),
        "limitation": model.get("limitation"),
    }


def _slim_worldbank_for_llm(world_bank: dict[str, Any]) -> dict[str, Any]:
    """Latest value per indicator only — the LLM does not need the full series."""
    slim: dict[str, Any] = {}
    for label, block in (world_bank or {}).items():
        if not isinstance(block, dict):
            continue
        entry: dict[str, Any] = {"latest": _latest_point(block.get("series") or [])}
        if block.get("error"):
            entry["error"] = block["error"]
        slim[label] = entry
    return slim


# --- state_impact (heatmap) builders ---------------------------------------
def _state_impact_from_model(model: dict[str, Any]) -> dict[str, float]:
    """Heatmap intensity (0-100) from each state's projected POLICY EFFECT (the
    pp gain attributable to this policy), scaled on an ABSOLUTE reference so the
    map genuinely responds to the policy: a weak/short policy yields a pale map,
    an aggressive one a saturated map. `ref` floors at 6 pp but grows if the
    policy's own effects exceed it, so extreme policies keep cross-state contrast
    instead of washing every state to the top of the ramp.

    (Previously this min-max scaled the absolute predicted LEVEL, which is
    dominated by fixed 2024 baselines — so every policy produced the same map.)"""
    states = model.get("states") or []
    effects = {s["state"]: max(0.0, float(s.get("policy_effect") or 0.0)) for s in states}
    if not effects:
        return {}
    ref = max(6.0, max(effects.values()))
    return {k: round(6.0 + 94.0 * min(1.0, v / ref), 2) for k, v in effects.items()}


def _state_impact_from_llm(agents: dict[str, Any]) -> dict[str, float]:
    maps: list[dict[str, Any]] = []
    for name in ("economic", "environment", "social"):
        weights = ((agents.get(name) or {}).get("output") or {}).get("affected_states_weight") or {}
        if isinstance(weights, dict) and weights:
            maps.append(weights)
    if not maps:
        return {}
    keys: set[str] = set()
    for m in maps:
        keys.update(m.keys())
    averaged = {}
    for key in keys:
        vals = []
        for m in maps:
            try:
                vals.append(float(m.get(key, 0) or 0))
            except (TypeError, ValueError):
                vals.append(0.0)
        averaged[key] = sum(vals) / len(maps)
    max_val = max(averaged.values()) if averaged else 0.0
    scale = 100.0 if max_val <= 1.5 else 1.0
    return {k: round(max(0.0, min(100.0, v * scale)), 2) for k, v in averaged.items()}


# --- evidence (retrieved sources) ------------------------------------------
_WB_URL = "https://data.worldbank.org/indicator/{code}"


def _latest_point(series: list[dict[str, Any]]) -> dict[str, Any] | None:
    for row in series or []:
        if row.get("value") is not None:
            return {"year": row.get("year"), "value": row.get("value")}
    return None


def _relevance_for(label: str, parsed: dict[str, Any]) -> str:
    """Why THIS indicator is tracked for THIS policy — honest context, not a
    claim that the indicator measures the policy directly."""
    domain = (parsed.get("domain") or "this").strip().lower()
    goals = parsed.get("goals") or []
    goal = str(goals[0]) if goals else ""
    l = label.lower()
    if "gdp" in l or "growth" in l:
        return f"National growth backdrop the {domain} policy's economic effects are read against."
    if "inflation" in l or "cpi" in l:
        return "Price-level context for the fiscal and cost pressures the policy introduces."
    if "co2" in l or "emission" in l:
        tail = f" toward {goal}." if goal else "."
        return f"Baseline emissions the policy's projected environmental effect is measured against{tail}"
    if "unemployment" in l:
        return "Labour-market slack relevant to the policy's employment effects."
    if "renewable" in l:
        return "Clean-energy share relevant to the policy's environmental goal."
    if "poverty" in l:
        return "Distributional baseline for judging who the policy's social impact reaches."
    return f"Macro context for the {domain} analysis."


def _build_evidence(
    world_bank: dict[str, Any],
    state_seed: dict[str, Any],
    model_summary: dict[str, Any] | None,
    parsed: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compact, UI-facing record of the evidence the analysis actually used."""
    parsed = parsed or {}
    sources: list[dict[str, Any]] = []
    for label, block in (world_bank or {}).items():
        if not isinstance(block, dict):
            continue
        series = block.get("series") or []
        indicator_name = None
        for row in series:
            if row.get("indicator"):
                indicator_name = row["indicator"]
                break
        code = block.get("code")
        sources.append(
            {
                "kind": "worldbank",
                "key": label,
                "title": indicator_name or label.replace("_", " ").title(),
                "provider": "World Bank Open Data",
                "code": code,
                "url": _WB_URL.format(code=code) if code else None,
                "latest": _latest_point(series),
                "series": series[:5],
                "relevance": _relevance_for(label, parsed),
                "error": block.get("error"),
            }
        )
    levers = (parsed.get("levers") or {}) if isinstance(parsed.get("levers"), dict) else {}
    policy_context = {
        "domain": parsed.get("domain"),
        "goals": (parsed.get("goals") or [])[:5],
        "affected_sectors": (parsed.get("affected_sectors") or [])[:6],
        "timeline_years": parsed.get("timeline_years"),
        "incentive_strength": levers.get("incentive_strength"),
        "infrastructure_push": levers.get("infrastructure_push"),
        "target_penetration_pct": levers.get("target_penetration_pct"),
        "levers_overridden": bool(parsed.get("levers_overridden")),
    }
    evidence: dict[str, Any] = {
        "policy_context": policy_context,
        "sources": sources,
        "state_seed": {
            "title": "State economic weights (manufacturing / agriculture / population share)",
            "provider": "POLARIS state seed dataset",
            "n_states": len(state_seed or {}),
            "fields": ["manufacturing_share", "agri_share", "population_share"],
        },
        "model": None,
    }
    if model_summary:
        h = model_summary.get("headline") or {}
        states = model_summary.get("states") or []
        ranked = sorted(states, key=lambda s: float(s.get("policy_effect") or 0.0), reverse=True)
        top_states = [
            {"state": s.get("state"), "policy_effect": s.get("policy_effect")}
            for s in ranked[:3]
        ]
        evidence["model"] = {
            "title": model_summary.get("method") or model_summary.get("model_name"),
            "provider": "POLARIS quantitative model",
            "provenance": model_summary.get("data_provenance"),
            "limitation": model_summary.get("limitation"),
            "outcome_label": model_summary.get("outcome_label"),
            "fit": model_summary.get("fit"),
            "highlights": {
                "effect": h.get("effect"),
                "baseline_value": h.get("baseline_value"),
                "projected_value": h.get("projected_value"),
                "ci_low": h.get("ci_low"),
                "ci_high": h.get("ci_high"),
                "top_states": top_states,
            },
        }
    return evidence


# --- debate room (conditional) ---------------------------------------------
def _conflicting_directions(dims: dict[str, Any]) -> tuple[str, str] | None:
    """Find two dimensions whose metric_effects disagree in direction on a
    shared metric keyword (both non-flat, reasonably confident)."""
    per_dim: dict[str, dict[str, str]] = {}
    for dim in ("economic", "environment", "social"):
        block = dims.get(dim) or {}
        for eff in block.get("metric_effects") or []:
            direction = eff.get("direction")
            if direction in {"up", "down"} and float(eff.get("confidence") or 0) >= 0.5:
                token = str(eff.get("metric") or "").strip().lower()
                for word in token.replace("/", " ").split():
                    if len(word) >= 4:
                        per_dim.setdefault(dim, {})[word] = direction
    dims_seen = list(per_dim.keys())
    for i in range(len(dims_seen)):
        for j in range(i + 1, len(dims_seen)):
            a, b = per_dim[dims_seen[i]], per_dim[dims_seen[j]]
            for word in set(a) & set(b):
                if a[word] != b[word]:
                    return (f"{dims_seen[i]}/{dims_seen[j]}", word)
    return None


def detect_conflict(
    model_summary: dict[str, Any] | None,
    dims: dict[str, Any],
    risk_out: dict[str, Any] | None,
) -> dict[str, Any]:
    """Decide whether the debate room should be instantiated.

    Triggers (per design): (a) the quantitative model's 95% CI spans zero, so
    the SIGN of the effect is uncertain; (b) the CI is unusually wide relative
    to the point estimate; (c) two analysis dimensions disagree on the
    direction of a shared metric; (d) risk is High with low confidence.
    Returns {triggered, trigger_reason, disputed_topic}.
    """
    if model_summary:
        h = model_summary.get("headline") or {}
        effect = float(h.get("effect") or 0.0)
        lo, hi = h.get("ci_low"), h.get("ci_high")
        if lo is not None and hi is not None:
            lo, hi = float(lo), float(hi)
            if lo < 0.0 < hi:
                return {
                    "triggered": True,
                    "trigger_reason": (
                        f"The model's 95% confidence interval [{lo:.2f}, {hi:.2f}] pp spans "
                        f"zero, so the sign of the {effect:+.2f} pp effect is statistically "
                        "uncertain."
                    ),
                    "disputed_topic": (
                        f"Whether the policy's effect on {model_summary.get('outcome_label') or 'the outcome'} "
                        "is genuinely positive given a confidence interval that crosses zero."
                    ),
                }
            width = hi - lo
            if abs(effect) > 1e-6 and width > 3.0 * abs(effect):
                return {
                    "triggered": True,
                    "trigger_reason": (
                        f"The confidence interval width ({width:.2f} pp) is large relative to the "
                        f"{effect:+.2f} pp point estimate — unusually wide variance for this domain."
                    ),
                    "disputed_topic": (
                        f"How much confidence the {effect:+.2f} pp estimate deserves given wide bands."
                    ),
                }

        # (e) The projection is an aggressive extrapolation beyond the calibration
        # window — a strong-intensity or long-horizon scenario the historical panel
        # does not directly support, so its credibility is worth stress-testing.
        levers = (model_summary or {}).get("policy_levers") or {}
        intensity = float(levers.get("intensity_multiplier") or 1.0)
        horizon = int(levers.get("horizon_years") or 5)
        if intensity >= 1.5 or horizon >= 8:
            reason_bits = []
            if intensity >= 1.5:
                reason_bits.append(f"a strong intensity multiplier ({intensity:.2g}×)")
            if horizon >= 8:
                reason_bits.append(f"a long {horizon}-year horizon")
            return {
                "triggered": True,
                "trigger_reason": (
                    "The projection extrapolates beyond the calibration window via "
                    + " and ".join(reason_bits)
                    + ", so its credibility carries scenario uncertainty worth stress-testing."
                ),
                "disputed_topic": (
                    "Whether the projected effect is credible given it extrapolates beyond the "
                    "policy strengths and horizons observed in the historical panel."
                ),
            }

    conflict = _conflicting_directions(dims)
    if conflict:
        pair, metric = conflict
        return {
            "triggered": True,
            "trigger_reason": (
                f"The {pair} analyses disagree on the direction of '{metric}' — a cross-dimension "
                "conflict in the retrieved evidence."
            ),
            "disputed_topic": f"Whether the net effect on '{metric}' is positive or negative.",
        }

    if risk_out and risk_out.get("risk_level") == "High" and float(risk_out.get("confidence") or 1.0) < 0.5:
        return {
            "triggered": True,
            "trigger_reason": (
                "Risk was rated High but with low confidence, signalling contested evidence."
            ),
            "disputed_topic": "Whether the High risk rating is warranted given weak agreement.",
        }

    return {
        "triggered": False,
        "trigger_reason": (
            "No debate needed: the model estimate is directionally clear and the analysis "
            "dimensions agree."
        ),
        "disputed_topic": None,
    }


async def _run_debate(
    client: httpx.AsyncClient,
    *,
    trigger: dict[str, Any],
    model_summary: dict[str, Any] | None,
    dims: dict[str, Any],
    risk_out: dict[str, Any] | None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Run up to two structured debate rounds. Never invents numbers; argues
    over the interpretation of the existing evidence. Groq failures degrade
    gracefully instead of killing the run."""
    context = {
        "disputed_topic": trigger.get("disputed_topic"),
        "trigger_reason": trigger.get("trigger_reason"),
        "model_headline": (model_summary or {}).get("headline"),
        "outcome_label": (model_summary or {}).get("outcome_label"),
        "analysis": dims,
        "risk": risk_out,
    }
    rounds: list[dict[str, Any]] = []
    resolution: dict[str, Any] | None = None
    try:
        r1 = await chat_json(
            client, system=DEBATE_ROUND1_SYSTEM, user=json.dumps(context, default=str),
            api_key=api_key,
        )
        round1 = normalize_debate_round(r1)
        rounds.append({"round": 1, "turns": round1.get("turns", [])})

        r2_context = dict(context)
        r2_context["round1_statements"] = round1.get("turns", [])
        r2 = await chat_json(
            client, system=DEBATE_ROUND2_SYSTEM, user=json.dumps(r2_context, default=str),
            api_key=api_key,
        )
        round2 = normalize_debate_round(r2)
        rounds.append({"round": 2, "turns": round2.get("turns", [])})
        resolution = round2.get("resolution")
    except GroqError as exc:
        return {
            "triggered": True,
            "trigger_reason": trigger.get("trigger_reason"),
            "disputed_topic": trigger.get("disputed_topic"),
            "rounds": rounds,
            "resolution": None,
            "error": f"Debate step failed: {exc}"[:240],
        }
    return {
        "triggered": True,
        "trigger_reason": trigger.get("trigger_reason"),
        "disputed_topic": trigger.get("disputed_topic"),
        "rounds": rounds,
        "resolution": resolution,
    }


async def _set_status(run_id: str, status: str, error: str | None = None) -> None:
    def mutate(p: dict[str, Any]) -> None:
        p["status"] = status
        if error is not None:
            p["error"] = error

    await db.patch_run(run_id, mutate)


async def _set_agent(
    run_id: str, name: str, *, status: str, output: dict[str, Any] | None = None
) -> None:
    def mutate(p: dict[str, Any]) -> None:
        p["agents"][name]["status"] = status
        if output is not None or status in {"done", "error"}:
            p["agents"][name]["output"] = output

    await db.patch_run(run_id, mutate)


async def run_pipeline(run_id: str, api_key: str | None = None) -> None:
    try:
        # Hard wall-clock ceiling. Every step has its own HTTP timeout, but a long
        # 429-retry chain across several steps can still outlive any useful wait,
        # and a run stuck in-flight leaves the dashboard polling forever.
        await asyncio.wait_for(_execute(run_id, api_key), timeout=RUN_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        try:
            await _set_status(
                run_id,
                "error",
                error=(
                    f"The analysis exceeded the {RUN_TIMEOUT_SECONDS}s time limit and was "
                    "stopped. This is usually rate limiting on the Groq free tier — "
                    "try again, or add your own API key in Settings."
                ),
            )
        except Exception:
            pass
    except Exception as exc:
        try:
            await _set_status(run_id, "error", error=str(exc)[:400])
        except Exception:
            pass


async def _execute(run_id: str, api_key: str | None = None) -> None:
    payload = await db.get_run(run_id)
    if payload is None:
        return

    policy_text = payload["policy_input"]["policy_text"]
    domain_hint = payload["policy_input"].get("domain_hint")
    lever_overrides = payload["policy_input"].get("lever_overrides")

    async with httpx.AsyncClient() as client:
        # 1) Parse ----------------------------------------------------------
        await _set_status(run_id, "parsing")
        try:
            parsed_raw = await chat_json(
                client,
                system=PARSER_SYSTEM,
                user=json.dumps({"policy_text": policy_text, "domain_hint": domain_hint}),
                api_key=api_key,
            )
        except GroqError as exc:
            raise RuntimeError(f"Parse step failed: {exc}") from exc
        parsed = normalize_parsed_policy(parsed_raw)
        # User-supplied lever overrides (from the Understood-as card) win over the
        # LLM parse, so a re-run reflects exactly what the user corrected.
        if isinstance(lever_overrides, dict) and lever_overrides:
            parsed = _apply_lever_overrides(parsed, lever_overrides)
        await db.patch_run(run_id, lambda p: p.__setitem__("parsed_policy", parsed))

        # 2) Policy-aware routing ------------------------------------------
        classification = classify_domain(policy_text, parsed)
        await db.patch_run(run_id, lambda p: p.__setitem__("classification", classification))
        supported = classification["support_level"] == "supported"

        # 3) Quantitative model (supported domains only) -------------------
        model_summary: dict[str, Any] | None = None
        if supported:
            await _set_status(run_id, "modeling")
            try:
                model_summary = await asyncio.to_thread(ev_model.run_model, parsed)
            except Exception as exc:  # never let the model kill the run
                model_summary = None
                classification["support_level"] = "unsupported"
                classification["rationale"] += f" (model unavailable: {exc}; fell back to qualitative)"
                supported = False
            if model_summary:

                def _persist_model(p: dict[str, Any]) -> None:
                    p["model_summary"] = model_summary
                    p["model_predictions"] = model_summary.get("states")
                    p["classification"] = classification

                await db.save_model_predictions(run_id, model_summary)
                await db.patch_run(run_id, _persist_model)
            else:
                # The downgrade above only lived in memory. Persist it, or the stored
                # run keeps claiming "supported" while carrying no model at all.
                await db.patch_run(
                    run_id, lambda p: p.__setitem__("classification", classification)
                )

        # 4) Supporting data -----------------------------------------------
        await _set_status(run_id, "fetching_data")
        world_bank = await fetch_supporting_indicators(
            client, parsed.get("domain") or domain_hint
        )
        state_seed = _load_state_seed()
        supported_model = supported and model_summary is not None
        evidence_bundle: dict[str, Any] = {
            "policy_text": policy_text,
            "domain_hint": domain_hint,
            "parsed_policy": parsed,
            "classification": classification,
            "support_level": classification["support_level"],
            "world_bank": _slim_worldbank_for_llm(world_bank),
            "model_predictions": _slim_model_for_llm(model_summary),  # required when supported
        }
        # state_seed only matters to the LLM when there is NO model to weight
        # states from — otherwise it is redundant tokens.
        if not supported_model:
            evidence_bundle["state_seed_data"] = state_seed
        # Persist a compact, UI-facing "Retrieved sources" record.
        evidence_view = _build_evidence(world_bank, state_seed, model_summary, parsed)
        await db.patch_run(run_id, lambda p: p.__setitem__("evidence", evidence_view))

        # 5) Merged multi-dimensional analysis (one call) ------------------
        await _set_status(run_id, "analyzing")
        for name in ("economic", "environment", "social"):
            await _set_agent(run_id, name, status="running")
        t0 = time.perf_counter()
        try:
            multidim_raw = await chat_json(
                client,
                system=MULTIDIM_SYSTEM,
                user=json.dumps({"evidence_bundle": evidence_bundle}, default=str),
                api_key=api_key,
            )
            dims = normalize_multidim(multidim_raw)
            for name in ("economic", "environment", "social"):
                await _set_agent(run_id, name, status="done", output=dims[name])
        except GroqError as exc:
            dims = {
                n: {"metric_effects": [], "reasoning": f"Analysis failed: {exc}",
                    "affected_states_weight": {}}
                for n in ("economic", "environment", "social")
            }
            for name in ("economic", "environment", "social"):
                await _set_agent(run_id, name, status="error", output=dims[name])
        multidim_ms = int((time.perf_counter() - t0) * 1000)

        # 6) Risk (separate call) ------------------------------------------
        await _set_agent(run_id, "risk", status="running")
        risk_out: dict[str, Any] | None = None
        try:
            risk_raw = await chat_json(
                client,
                system=RISK_SYSTEM,
                user=json.dumps(
                    {
                        "support_level": classification["support_level"],
                        "model_predictions": _slim_model_for_llm(model_summary),
                        "analysis": dims,
                        "evidence_bundle": {
                            "parsed_policy": parsed,
                            "world_bank": _slim_worldbank_for_llm(world_bank),
                        },
                    },
                    default=str,
                ),
                api_key=api_key,
            )
            risk_out = normalize_risk_output(risk_raw)
            await _set_agent(run_id, "risk", status="done", output=risk_out)
        except GroqError as exc:
            await _set_agent(
                run_id, "risk", status="error",
                output={"risk_level": "Medium",
                        "justification": f"Risk step failed: {exc}", "confidence": 0.0},
            )

        # 7) Debate room (conditional) -------------------------------------
        trigger = detect_conflict(model_summary, dims, risk_out)
        if trigger["triggered"]:
            await _set_status(run_id, "debating")
            debate = await _run_debate(
                client,
                trigger=trigger,
                model_summary=model_summary,
                dims=dims,
                risk_out=risk_out,
                api_key=api_key,
            )
        else:
            debate = trigger  # {triggered: False, trigger_reason, disputed_topic}
        await db.patch_run(run_id, lambda p: p.__setitem__("debate", debate))
        debate_resolution = debate.get("resolution") if debate.get("triggered") else None

        # 8) Synthesis ------------------------------------------------------
        await _set_status(run_id, "synthesizing")
        try:
            synthesis_raw = await chat_json(
                client,
                system=SYNTHESIS_SYSTEM,
                user=json.dumps(
                    {
                        "support_level": classification["support_level"],
                        "model_headline": (model_summary or {}).get("headline"),
                        "analysis": dims,
                        "risk": risk_out,
                        "debate_resolution": debate_resolution,
                    },
                    default=str,
                ),
                api_key=api_key,
            )
        except GroqError as exc:
            raise RuntimeError(f"Synthesis step failed: {exc}") from exc

        # 9) Heatmap: real model for supported, LLM estimate otherwise -----
        latest = await db.get_run(run_id)
        assert latest is not None
        if supported and model_summary:
            state_impact = _state_impact_from_model(model_summary)
            impact_source = "quantitative_model"
        else:
            state_impact = _state_impact_from_llm(latest["agents"])
            impact_source = "llm_estimate"

        def finish(p: dict[str, Any]) -> None:
            p["synthesis"] = normalize_synthesis(synthesis_raw)
            p["state_impact"] = state_impact
            p["state_impact_source"] = impact_source
            p["status"] = "complete"
            p["error"] = None

        await db.patch_run(run_id, finish)

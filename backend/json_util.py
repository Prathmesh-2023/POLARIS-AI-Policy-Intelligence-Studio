from __future__ import annotations

import json
import re
from typing import Any

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def parse_json_object(text: str) -> dict[str, Any]:
    cleaned = _FENCE.sub("", text.strip()).strip()
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("Model output was not a JSON object")
    return data


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def as_confidence(value: Any) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    if n > 1.0:
        n = n / 100.0
    return clamp(n, 0.0, 1.0)


def as_score_100(value: Any) -> float:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    if 0.0 <= n <= 1.0:
        n = n * 100.0
    return clamp(n, 0.0, 100.0)


def normalize_domain_output(raw: dict[str, Any]) -> dict[str, Any]:
    effects = []
    for item in raw.get("metric_effects") or []:
        if not isinstance(item, dict):
            continue
        direction = str(item.get("direction", "flat")).lower()
        if direction not in {"up", "down", "flat"}:
            direction = "flat"
        magnitude = str(item.get("magnitude", "moderate")).lower()
        if magnitude not in {"small", "moderate", "large"}:
            magnitude = "moderate"
        effects.append(
            {
                "metric": str(item.get("metric") or "unspecified"),
                "direction": direction,
                "magnitude": magnitude,
                "confidence": as_confidence(item.get("confidence", 0)),
            }
        )
    weights: dict[str, float] = {}
    raw_weights = raw.get("affected_states_weight") or {}
    if isinstance(raw_weights, dict):
        for name, val in raw_weights.items():
            try:
                weights[str(name)] = float(val)
            except (TypeError, ValueError):
                continue
    return {
        "metric_effects": effects,
        "reasoning": str(raw.get("reasoning") or ""),
        "affected_states_weight": weights,
    }


def normalize_multidim(raw: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Split a merged multi-dimensional LLM response into the three
    per-dimension outputs, each normalised like a domain-agent output."""
    out: dict[str, dict[str, Any]] = {}
    for dim in ("economic", "environment", "social"):
        block = raw.get(dim)
        if isinstance(block, dict):
            out[dim] = normalize_domain_output(block)
        else:
            out[dim] = {
                "metric_effects": [],
                "reasoning": "",
                "affected_states_weight": {},
            }
    return out


def normalize_risk_output(raw: dict[str, Any]) -> dict[str, Any]:
    level = str(raw.get("risk_level") or "Medium")
    if level not in {"Low", "Medium", "High"}:
        lowered = level.lower()
        level = {"low": "Low", "medium": "Medium", "high": "High"}.get(lowered, "Medium")
    return {
        "risk_level": level,
        "justification": str(raw.get("justification") or ""),
        "confidence": as_confidence(raw.get("confidence", 0)),
    }


def normalize_parsed_policy(raw: dict[str, Any]) -> dict[str, Any]:
    def str_list(key: str) -> list[str]:
        val = raw.get(key) or []
        if isinstance(val, str):
            return [val]
        return [str(x) for x in val if x is not None]

    years = raw.get("timeline_years") or 5
    try:
        years = int(float(years))
    except (TypeError, ValueError):
        years = 5
    years = max(1, min(years, 15))
    return {
        "domain": str(raw.get("domain") or "Unspecified"),
        "goals": str_list("goals"),
        "stakeholders": str_list("stakeholders"),
        "affected_sectors": str_list("affected_sectors"),
        "timeline_years": years,
        "levers": normalize_levers(raw.get("levers")),
    }


_STRENGTH = {"none", "low", "medium", "high"}


def normalize_levers(raw: Any) -> dict[str, Any]:
    """Normalize the policy 'levers' block into a clean, bounded shape. Missing
    values fall back to a moderate reference policy so an under-specified policy
    still projects sensibly (rather than crashing or looking blank)."""
    raw = raw if isinstance(raw, dict) else {}

    def strength(key: str, default: str) -> str:
        val = str(raw.get(key) or "").strip().lower()
        return val if val in _STRENGTH else default

    target = raw.get("target_penetration_pct")
    try:
        target = float(target) if target is not None else None
    except (TypeError, ValueError):
        target = None
    if target is not None:
        target = clamp(target, 0.0, 100.0)
    return {
        "incentive_strength": strength("incentive_strength", "medium"),
        "infrastructure_push": strength("infrastructure_push", "low"),
        "target_penetration_pct": target,
    }


def normalize_synthesis(raw: dict[str, Any]) -> dict[str, Any]:
    level = str(raw.get("risk_level") or "Medium")
    if level not in {"Low", "Medium", "High"}:
        lowered = level.lower()
        level = {"low": "Low", "medium": "Medium", "high": "High"}.get(lowered, "Medium")
    effects = raw.get("top_3_effects") or []
    if isinstance(effects, str):
        effects = [effects]
    effects = [str(x) for x in effects][:3]
    while len(effects) < 3:
        effects.append("")
    return {
        "overall_impact_score": as_score_100(raw.get("overall_impact_score", 0)),
        "verdict": str(raw.get("verdict") or ""),
        "top_3_effects": effects,
        "risk_level": level,
        "confidence": as_confidence(raw.get("confidence", 0)),
    }


_ALLOWED_SPEAKERS = {"proponent": "Proponent", "skeptic": "Skeptic", "moderator": "Moderator"}


def _normalize_turns(raw_turns: Any) -> list[dict[str, str]]:
    turns: list[dict[str, str]] = []
    if not isinstance(raw_turns, list):
        return turns
    for item in raw_turns:
        if not isinstance(item, dict):
            continue
        speaker = _ALLOWED_SPEAKERS.get(str(item.get("speaker", "")).strip().lower())
        argument = str(item.get("argument") or "").strip()
        if speaker and argument:
            turns.append({"speaker": speaker, "argument": argument})
    return turns


def normalize_debate_round(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize one debate round's LLM output into {turns, resolution?}."""
    out: dict[str, Any] = {"turns": _normalize_turns(raw.get("turns"))}
    res = raw.get("resolution")
    if isinstance(res, dict):
        leaning = str(res.get("leaning") or "indeterminate").strip().lower()
        if leaning not in {"proponent", "skeptic", "indeterminate"}:
            leaning = "indeterminate"
        out["resolution"] = {
            "conclusion": str(res.get("conclusion") or "").strip(),
            "leaning": leaning,
            "adjusted_confidence": as_confidence(res.get("adjusted_confidence", 0)),
        }
    return out

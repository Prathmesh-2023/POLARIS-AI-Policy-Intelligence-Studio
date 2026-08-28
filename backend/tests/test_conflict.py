"""The debate room is instantiated by `detect_conflict`, and only by it.

Each branch here is a claim shown to the user ("why are these agents arguing?"),
so the truth table is pinned: a wrong branch produces a confident explanation of
a conflict that does not exist.
"""

from __future__ import annotations

import ev_model
from pipeline import detect_conflict


def summary(
    *,
    effect: float,
    lo: float | None,
    hi: float | None,
    horizon: int = 5,
    intensity: float = 1.0,
) -> dict:
    return {
        "outcome_label": "EV share of new-vehicle registrations",
        "headline": {"effect": effect, "ci_low": lo, "ci_high": hi},
        "policy_levers": {"horizon_years": horizon, "intensity_multiplier": intensity},
    }


def effects(*specs: tuple[str, str, float]) -> dict:
    return {
        "metric_effects": [
            {"metric": m, "direction": d, "confidence": c} for m, d, c in specs
        ]
    }


def test_an_interval_that_spans_zero_disputes_the_sign() -> None:
    out = detect_conflict(summary(effect=0.4, lo=-1.0, hi=1.8), {}, None)
    assert out["triggered"] is True
    assert "spans zero" in out["trigger_reason"]


def test_a_wide_interval_disputes_the_confidence_not_the_sign() -> None:
    out = detect_conflict(summary(effect=1.0, lo=0.0, hi=4.0), {}, None)
    assert out["triggered"] is True
    assert "width" in out["trigger_reason"]
    assert "spans zero" not in out["trigger_reason"]


def test_a_long_horizon_or_strong_intensity_is_flagged_as_extrapolation() -> None:
    long = detect_conflict(summary(effect=2.0, lo=1.0, hi=3.0, horizon=10), {}, None)
    assert long["triggered"] is True
    assert "10-year horizon" in long["trigger_reason"]
    strong = detect_conflict(summary(effect=2.0, lo=1.0, hi=3.0, intensity=1.8), {}, None)
    assert strong["triggered"] is True
    assert "intensity" in strong["trigger_reason"]


def test_a_tight_short_horizon_projection_needs_no_debate() -> None:
    out = detect_conflict(summary(effect=2.0, lo=1.0, hi=3.0), {}, None)
    assert out["triggered"] is False
    assert out["disputed_topic"] is None


def test_dimensions_disagreeing_on_a_shared_metric_trigger_a_debate() -> None:
    dims = {
        "economic": effects(("jobs growth", "up", 0.8)),
        "social": effects(("jobs quality", "down", 0.9)),
    }
    out = detect_conflict(None, dims, None)
    assert out["triggered"] is True
    assert "economic/social" in out["trigger_reason"]
    assert "jobs" in out["disputed_topic"]


def test_agreement_or_low_confidence_does_not_trigger_a_debate() -> None:
    agree = {
        "economic": effects(("jobs growth", "up", 0.8)),
        "social": effects(("jobs quality", "up", 0.9)),
    }
    assert detect_conflict(None, agree, None)["triggered"] is False
    # A disagreement neither side is confident about is noise, not a conflict.
    unsure = {
        "economic": effects(("jobs growth", "up", 0.2)),
        "social": effects(("jobs quality", "down", 0.3)),
    }
    assert detect_conflict(None, unsure, None)["triggered"] is False


def test_high_risk_is_only_disputed_when_confidence_is_low() -> None:
    contested = detect_conflict(None, {}, {"risk_level": "High", "confidence": 0.3})
    assert contested["triggered"] is True
    assert "low confidence" in contested["trigger_reason"]
    assert detect_conflict(None, {}, {"risk_level": "High", "confidence": 0.9})["triggered"] is False
    assert detect_conflict(None, {}, {"risk_level": "Low", "confidence": 0.1})["triggered"] is False


def test_the_projection_can_no_longer_produce_a_sign_dispute() -> None:
    """`ci_low` is now floored at zero, so branch (a) is unreachable from the model.

    Kept as a regression guard: if a future change lets a bound go negative, the
    UI would start claiming the direction of the effect is in doubt.
    """
    for pol in (
        {"timeline_years": 1, "levers": {"incentive_strength": "none", "infrastructure_push": "none"}},
        {"timeline_years": 5, "levers": {"incentive_strength": "medium", "infrastructure_push": "low"}},
        {"timeline_years": 15, "levers": {"incentive_strength": "high", "infrastructure_push": "high"}},
    ):
        out = detect_conflict(ev_model.run_model(pol), {}, None)
        assert "spans zero" not in out["trigger_reason"]

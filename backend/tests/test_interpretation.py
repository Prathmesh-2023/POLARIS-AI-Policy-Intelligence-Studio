"""The interpretation layer must describe the numbers it is given, exactly.

The panel's job is to be trustworthy: if these strings can drift from the figures
beside them the whole feature is worse than nothing. So the tests here pin the
classification thresholds and the target wording rather than the prose itself.
"""

from __future__ import annotations

from interpretation import build_interpretation


def model(
    *,
    effect: float,
    ci_low: float,
    ci_high: float,
    base: float = 8.0,
    horizon: int = 5,
    target: float | None = None,
    target_status: str = "none",
    capped: int = 0,
    met: int = 0,
    states: list[dict] | None = None,
) -> dict:
    return {
        "unit": "percentage points",
        "outcome_label": "EV share of new-vehicle registrations",
        "headline": {
            "effect": effect,
            "ci_low": ci_low,
            "ci_high": ci_high,
            "baseline_value": base,
            "projected_value": base + effect,
        },
        "policy_levers": {
            "horizon_years": horizon,
            "target_penetration_pct": target,
            "target_status": target_status,
            "states_target_capped": capped,
            "states_target_already_met": met,
        },
        "states": states if states is not None else [{"confidence": "medium"}],
        "distribution": {},
        "sensitivity": {},
    }


def test_tight_interval_is_labelled_tight() -> None:
    unc = build_interpretation(model(effect=2.0, ci_low=1.5, ci_high=2.5))["uncertainty"]
    assert unc["label"] == "tight"
    assert unc["includes_no_change"] is False


def test_interval_wider_than_the_estimate_is_labelled_wide() -> None:
    unc = build_interpretation(model(effect=1.0, ci_low=0.0, ci_high=3.0))["uncertainty"]
    assert unc["label"] == "wide"
    assert unc["includes_no_change"] is True


def test_moderate_sits_between_the_two() -> None:
    unc = build_interpretation(model(effect=2.0, ci_low=0.8, ci_high=3.2))["uncertainty"]
    assert unc["label"] == "moderate"


def test_a_collapsed_interval_is_attributed_to_the_target() -> None:
    block = build_interpretation(
        model(effect=1.0, ci_low=1.0, ci_high=1.0, target=9.0, target_status="binding", capped=3)
    )
    assert block["uncertainty"]["label"] == "pinned"
    assert "target" in block["uncertainty"]["text"].lower()
    # The redundant "range includes no change" caveat is suppressed here.
    assert not any("might not move the needle" in c for c in block["caveats"])


def test_relative_change_and_per_year_are_arithmetic_on_the_inputs() -> None:
    block = build_interpretation(model(effect=2.0, ci_low=1.0, ci_high=3.0, base=8.0, horizon=4))
    assert block["relative_change_pct"] == 25.0
    assert block["per_year_effect"] == 0.5


def test_zero_effect_reads_as_no_change_not_as_a_gain() -> None:
    block = build_interpretation(
        model(effect=0.0, ci_low=0.0, ci_high=0.0, target=2.0, target_status="already_met", met=23)
    )
    assert "no measurable change" in block["reads"][0]["text"].lower()
    assert "already at or above" in block["reads"][-1]["text"]


def test_a_long_horizon_adds_an_extrapolation_caveat() -> None:
    short = build_interpretation(model(effect=2.0, ci_low=1.0, ci_high=3.0, horizon=5))
    long = build_interpretation(model(effect=2.0, ci_low=1.0, ci_high=3.0, horizon=12))
    assert not any("extrapolates" in c for c in short["caveats"])
    assert any("extrapolates" in c for c in long["caveats"])


def test_low_confidence_states_are_surfaced() -> None:
    states = [{"confidence": "low"}, {"confidence": "low"}, {"confidence": "high"}]
    block = build_interpretation(
        model(effect=2.0, ci_low=1.0, ci_high=3.0, states=states)
    )
    assert block["confidence_mix"] == {"high": 1, "medium": 0, "low": 2}
    assert any("low-confidence" in r["text"] for r in block["reads"])


def test_missing_sections_do_not_raise() -> None:
    block = build_interpretation({"headline": {}, "policy_levers": {}, "states": []})
    assert block["one_liner"]
    assert block["glossary"]

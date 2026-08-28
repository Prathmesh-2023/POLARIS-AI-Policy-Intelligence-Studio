"""Invariants the EV projection must never violate.

These are the properties a reader of the dashboard implicitly relies on: an
interval that contains its own point estimate, a projection that cannot exceed a
ceiling or a stated target, a stronger policy that does more than a weaker one,
and identical output for identical input. They are written as invariants rather
than golden numbers so a legitimate re-calibration doesn't break the suite.
"""

from __future__ import annotations

import pytest

import ev_model


def policy(
    *,
    incentive: str = "medium",
    infra: str = "low",
    horizon: int = 5,
    target: float | None = None,
) -> dict:
    return {
        "timeline_years": horizon,
        "levers": {
            "incentive_strength": incentive,
            "infrastructure_push": infra,
            "target_penetration_pct": target,
        },
    }


GRID = [
    policy(),
    policy(incentive="none", infra="none", horizon=1),
    policy(incentive="high", infra="high", horizon=15),
    policy(incentive="high", infra="medium", target=9.0),
    policy(incentive="low", infra="high", target=2.0),
    policy(incentive="medium", infra="medium", target=95.0),
]


@pytest.mark.parametrize("pol", GRID)
def test_state_intervals_are_ordered_and_feasible(pol: dict) -> None:
    model = ev_model.run_model(pol)
    target = (model["policy_levers"] or {}).get("target_penetration_pct")
    for s in model["states"]:
        assert 0.0 <= s["ci_lower"] <= s["policy_effect"] <= s["ci_upper"] + 1e-9
        # No bound may imply a penetration above the assumed saturation ceiling...
        assert s["baseline_value"] + s["ci_upper"] <= ev_model.EV_CEILING_PCT + 1e-9
        # ...or above a stated target (a state already past the target stays put).
        if target is not None:
            ceiling = max(float(target), s["baseline_value"])
            assert s["baseline_value"] + s["ci_upper"] <= ceiling + 1e-9
        assert s["predicted_value"] == pytest.approx(
            s["baseline_value"] + s["policy_effect"], abs=1e-6
        )


@pytest.mark.parametrize("pol", GRID)
def test_headline_is_consistent_with_its_own_interval(pol: dict) -> None:
    h = ev_model.run_model(pol)["headline"]
    assert h["ci_low"] <= h["effect"] <= h["ci_high"] + 1e-9
    assert h["projected_value"] == pytest.approx(
        h["baseline_value"] + h["effect"], abs=0.002
    )
    assert h["ci_low"] >= 0.0


def test_target_below_baseline_yields_no_projected_gain() -> None:
    """A target under today's level is already met — it must not be ignored."""
    model = ev_model.run_model(policy(incentive="high", infra="high", target=1.0))
    assert model["headline"]["effect"] == pytest.approx(0.0, abs=1e-9)
    assert model["policy_levers"]["target_status"] == "already_met"
    assert all(s["policy_effect"] == 0.0 for s in model["states"])


def test_target_status_reflects_whether_the_target_binds() -> None:
    assert ev_model.run_model(policy())["policy_levers"]["target_status"] == "none"
    binding = ev_model.run_model(policy(incentive="high", infra="high", target=9.0))
    assert binding["policy_levers"]["target_status"] == "binding"
    assert binding["policy_levers"]["states_target_capped"] > 0
    loose = ev_model.run_model(policy(incentive="low", infra="none", target=99.0))
    assert loose["policy_levers"]["target_status"] == "not_binding"
    assert loose["policy_levers"]["states_target_capped"] == 0


def test_a_stronger_policy_projects_a_larger_effect() -> None:
    weak = ev_model.run_model(policy(incentive="none", infra="none"))["headline"]["effect"]
    mid = ev_model.run_model(policy(incentive="medium", infra="low"))["headline"]["effect"]
    strong = ev_model.run_model(policy(incentive="high", infra="high"))["headline"]["effect"]
    assert weak < mid < strong


def test_a_longer_horizon_projects_a_larger_effect_and_wider_interval() -> None:
    short = ev_model.run_model(policy(horizon=2))["headline"]
    long = ev_model.run_model(policy(horizon=10))["headline"]
    assert long["effect"] > short["effect"]
    short_width = short["ci_high"] - short["ci_low"]
    long_width = long["ci_high"] - long["ci_low"]
    assert long_width > short_width


def test_projection_is_deterministic() -> None:
    first = ev_model.run_model(policy(incentive="high", infra="medium", horizon=7))
    second = ev_model.run_model(policy(incentive="high", infra="medium", horizon=7))
    assert first == second


def test_missing_or_junk_policy_still_projects() -> None:
    """The parser can hand over anything; the model must not raise on it."""
    for pol in (None, {}, {"timeline_years": "abc", "levers": {"incentive_strength": 7}}):
        model = ev_model.run_model(pol)
        assert model["states"]
        assert 1 <= model["policy_levers"]["horizon_years"] <= 15


def test_run_model_carries_a_deterministic_interpretation() -> None:
    model = ev_model.run_model(policy(incentive="high", infra="medium"))
    block = model["interpretation"]
    assert block["one_liner"]
    assert len(block["reads"]) >= 2
    assert block["caveats"]
    # Same input, same words — the interpretation must not be LLM-generated.
    assert block == ev_model.run_model(policy(incentive="high", infra="medium"))["interpretation"]


def test_compare_policies_diffs_two_designs() -> None:
    result = ev_model.compare_policies(
        policy(incentive="none", infra="none"), policy(incentive="high", infra="high")
    )
    assert result["a"]["headline"]["effect"] < result["b"]["headline"]["effect"]
    assert len(result["per_state"]) == len(result["a"]["states"])

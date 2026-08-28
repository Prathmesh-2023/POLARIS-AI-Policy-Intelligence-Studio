"""The normalizers are the only thing standing between raw LLM output and the UI.

Every function here has to turn arbitrary, possibly hostile JSON into a bounded,
correctly-shaped object without raising — the pipeline has no other guard.
"""

from __future__ import annotations

import pytest

from json_util import (
    as_confidence,
    as_score_100,
    normalize_debate_round,
    normalize_levers,
    normalize_multidim,
    normalize_parsed_policy,
    normalize_risk_output,
    normalize_synthesis,
    parse_json_object,
)


def test_parse_json_object_strips_code_fences() -> None:
    assert parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_object('  {"a": 1}  ') == {"a": 1}


def test_parse_json_object_rejects_non_objects() -> None:
    with pytest.raises(ValueError):
        parse_json_object("[1, 2, 3]")


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(0.42, 0.42), (85, 0.85), (150, 1.0), (-3, 0.0), ("0.5", 0.5), ("abc", 0.0), (None, 0.0)],
)
def test_as_confidence_normalises_to_a_zero_one_scale(raw: object, expected: float) -> None:
    assert as_confidence(raw) == pytest.approx(expected)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(0.6, 60.0), (72, 72.0), (140, 100.0), (-5, 0.0), ("junk", 0.0)],
)
def test_as_score_100_normalises_to_a_hundred_scale(raw: object, expected: float) -> None:
    assert as_score_100(raw) == pytest.approx(expected)


def test_normalize_levers_falls_back_to_a_moderate_reference_policy() -> None:
    assert normalize_levers(None) == {
        "incentive_strength": "medium",
        "infrastructure_push": "low",
        "target_penetration_pct": None,
    }
    assert normalize_levers({"incentive_strength": "VERY HIGH"})["incentive_strength"] == "medium"
    assert normalize_levers({"infrastructure_push": " High "})["infrastructure_push"] == "high"


def test_normalize_levers_clamps_the_target_to_a_percentage() -> None:
    assert normalize_levers({"target_penetration_pct": 250})["target_penetration_pct"] == 100.0
    assert normalize_levers({"target_penetration_pct": -4})["target_penetration_pct"] == 0.0
    assert normalize_levers({"target_penetration_pct": "x"})["target_penetration_pct"] is None


def test_normalize_parsed_policy_bounds_the_timeline_and_coerces_lists() -> None:
    out = normalize_parsed_policy({"goals": "one goal", "timeline_years": 99})
    assert out["goals"] == ["one goal"]
    assert out["timeline_years"] == 15
    assert normalize_parsed_policy({"timeline_years": -3})["timeline_years"] == 1
    # A zero timeline is meaningless, so it falls back to the 5-year default
    # rather than being clamped up to 1.
    assert normalize_parsed_policy({"timeline_years": 0})["timeline_years"] == 5
    assert normalize_parsed_policy({})["domain"] == "Unspecified"


def test_normalize_domain_outputs_drop_junk_entries() -> None:
    out = normalize_multidim(
        {
            "economic": {
                "metric_effects": [
                    {"metric": "jobs", "direction": "UP", "magnitude": "huge", "confidence": 90},
                    "not a dict",
                ],
                "reasoning": "because",
                "affected_states_weight": {"Bihar": "0.5", "Goa": "nope"},
            },
            "environment": "not a dict",
        }
    )
    effect = out["economic"]["metric_effects"][0]
    assert len(out["economic"]["metric_effects"]) == 1
    assert effect["direction"] == "up"
    assert effect["magnitude"] == "moderate"  # "huge" isn't a valid magnitude
    assert effect["confidence"] == pytest.approx(0.9)
    assert out["economic"]["affected_states_weight"] == {"Bihar": 0.5}
    assert out["environment"]["metric_effects"] == []
    assert out["social"]["reasoning"] == ""


def test_normalize_risk_and_synthesis_coerce_levels_and_pad_effects() -> None:
    assert normalize_risk_output({"risk_level": "high"})["risk_level"] == "High"
    assert normalize_risk_output({"risk_level": "catastrophic"})["risk_level"] == "Medium"
    synth = normalize_synthesis({"top_3_effects": "only one", "overall_impact_score": 0.5})
    assert synth["top_3_effects"] == ["only one", "", ""]
    assert synth["overall_impact_score"] == pytest.approx(50.0)
    assert normalize_synthesis({"top_3_effects": ["a", "b", "c", "d"]})["top_3_effects"] == [
        "a",
        "b",
        "c",
    ]


def test_normalize_debate_round_keeps_only_well_formed_turns() -> None:
    out = normalize_debate_round(
        {
            "turns": [
                {"speaker": "proponent", "argument": "yes"},
                {"speaker": "narrator", "argument": "hi"},
                {"speaker": "Skeptic", "argument": "   "},
                "junk",
            ],
            "resolution": {"conclusion": "ok", "leaning": "sideways", "adjusted_confidence": 70},
        }
    )
    assert out["turns"] == [{"speaker": "Proponent", "argument": "yes"}]
    assert out["resolution"]["leaning"] == "indeterminate"
    assert out["resolution"]["adjusted_confidence"] == pytest.approx(0.7)


def test_normalize_debate_round_without_resolution() -> None:
    assert "resolution" not in normalize_debate_round({"turns": []})

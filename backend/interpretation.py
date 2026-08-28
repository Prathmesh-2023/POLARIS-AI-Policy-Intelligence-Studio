"""Deterministic, LLM-free reading of a model summary.

Everything here is arithmetic and string formatting over numbers the model already
produced. No network call, no LLM, nothing invented — so the plain-language text on
the dashboard can never disagree with the chart beside it, and the same model
summary always yields the same words.

The goal is interpretability: a reader who does not know what "percentage points"
or a "95% interval" mean should still be able to say what the dashboard claims,
how confident it is, and what would change it.
"""

from __future__ import annotations

from typing import Any

# Below this share of the point estimate the interval is "tight"; above 1.0 the
# interval is wider than the estimate itself, which is the honest signal that the
# projection cannot rule out "no change".
_TIGHT = 0.4
_WIDE = 1.0


def _f(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def _pct(x: float) -> str:
    return f"{x:.1f}%"


def _pp(x: float) -> str:
    return f"{x:+.2f} pp"


def _uncertainty(effect: float, ci_low: float, ci_high: float) -> dict[str, Any]:
    """Classify the interval width relative to the estimate and say what it means."""
    span = max(0.0, ci_high - ci_low)
    half = span / 2.0
    ratio = half / max(abs(effect), 1e-6)
    includes_no_change = ci_low <= 0.0 <= ci_high
    if span == 0.0:
        label = "pinned"
        text = (
            "The interval collapses because a stated target, not the estimated "
            "response, is setting the number."
        )
    elif ratio < _TIGHT:
        label = "tight"
        text = (
            "The plausible range is narrow relative to the projected gain, so the "
            "direction and rough size are both reasonably well pinned down."
        )
    elif ratio < _WIDE:
        label = "moderate"
        text = (
            "The plausible range is a substantial fraction of the projected gain. "
            "Read the range as the answer and the midpoint as its centre, not as a "
            "forecast in its own right."
        )
    else:
        label = "wide"
        text = (
            "The plausible range is wider than the projected gain itself, which "
            "means the model cannot rule out an outcome close to no change. Treat "
            "the direction as informative and the magnitude as weakly identified."
        )
    return {
        "label": label,
        "half_width": round(half, 3),
        "relative_width": round(ratio, 3),
        "includes_no_change": includes_no_change,
        "text": text,
    }


def _target_note(levers: dict[str, Any]) -> str | None:
    """Explain how a stated target interacts with today's levels, if at all."""
    status = levers.get("target_status") or "none"
    target = levers.get("target_penetration_pct")
    if status == "none" or target is None:
        return None
    tgt = _f(target)
    capped = int(_f(levers.get("states_target_capped")))
    met = int(_f(levers.get("states_target_already_met")))
    if status == "already_met":
        return (
            f"Every modelled state is already at or above the stated {tgt:.0f}% "
            "target, so the model projects no additional gain from it. The target "
            "is not the binding constraint on this policy — its other levers are."
        )
    if status == "binding":
        extra = f" ({met} are already above it.)" if met else ""
        return (
            f"The stated {tgt:.0f}% target caps the projected gain in {capped} of "
            "the modelled states, so those figures describe the target being met "
            f"rather than the response the model would otherwise predict.{extra}"
        )
    return (
        f"The projected gains stay below the stated {tgt:.0f}% target everywhere, "
        "so the target never binds. The projection is driven entirely by the "
        "incentive and infrastructure levers."
    )


def _distribution_note(distribution: dict[str, Any]) -> str | None:
    """Who gains most, in income terms, straight from the projected effects."""
    groups = [g for g in (distribution.get("by_income_group") or []) if g.get("n_states")]
    if len(groups) < 2:
        return None
    ranked = sorted(groups, key=lambda g: _f(g.get("avg_effect")), reverse=True)
    top, bottom = ranked[0], ranked[-1]
    gap = _f(top.get("avg_effect")) - _f(bottom.get("avg_effect"))
    lead = str(top.get("label") or top.get("group") or "").lower()
    trail = str(bottom.get("label") or bottom.get("group") or "").lower()
    if gap < 0.05:
        return (
            "Projected gains are spread evenly across income tiers — this policy "
            "design does not tilt strongly toward richer or poorer states."
        )
    return (
        f"{lead.capitalize()} gain most on average ({_pp(_f(top.get('avg_effect')))}) "
        f"and {trail} least ({_pp(_f(bottom.get('avg_effect')))}) — a spread of "
        f"{gap:.2f} pp. That tilt comes from the policy's mix of levers, not from "
        "the states' size."
    )


def _driver_note(sens: dict[str, Any], unit: str) -> str | None:
    """Which lever the result actually hangs on, from the sensitivity sweep."""
    bars = sens.get("bars") or []
    if not bars:
        return None
    top = max(bars, key=lambda b: _f(b.get("swing")))
    swing = _f(top.get("swing"))
    if swing <= 0.01:
        return "No single lever moves the projected outcome much on its own."
    return (
        f"{top.get('label')} is the lever the result hangs on: moving it from "
        f"\"{top.get('low_setting')}\" to \"{top.get('high_setting')}\" swings the "
        f"national projection by {swing:.2f} {unit}, holding everything else fixed."
    )


def _confidence_mix(states: list[dict[str, Any]]) -> dict[str, int]:
    mix = {"high": 0, "medium": 0, "low": 0}
    for s in states:
        key = str(s.get("confidence") or "").lower()
        if key in mix:
            mix[key] += 1
    return mix


def build_interpretation(model: dict[str, Any]) -> dict[str, Any]:
    """Turn a model summary into plain-language reads of the same numbers.

    Returns a block with: a one-line claim, a small set of labelled "how to read
    this" statements, an uncertainty verdict, and the caveats a reader needs in
    order to not over-trust the figure.
    """
    headline = model.get("headline") or {}
    levers = model.get("policy_levers") or {}
    states = model.get("states") or []
    unit = str(model.get("unit") or "percentage points")
    outcome = str(model.get("outcome_label") or "the outcome")

    effect = _f(headline.get("effect"))
    ci_low = _f(headline.get("ci_low"))
    ci_high = _f(headline.get("ci_high"))
    base = _f(headline.get("baseline_value"))
    proj = _f(headline.get("projected_value"))
    horizon = max(1, int(_f(levers.get("horizon_years"), 5)))

    relative = (effect / base * 100.0) if base > 0 else 0.0
    per_year = effect / horizon

    if effect <= 0.005:
        one_liner = (
            f"On these assumptions the policy moves {outcome} by essentially nothing "
            f"— {_pct(base)} today, {_pct(proj)} after {horizon} years."
        )
    else:
        one_liner = (
            f"On these assumptions {outcome} rises from {_pct(base)} to {_pct(proj)} "
            f"across the modelled states over {horizon} years — a gain of {_pp(effect)}."
        )

    unc = _uncertainty(effect, ci_low, ci_high)
    mix = _confidence_mix(states)

    if effect <= 0.005:
        number_text = (
            f"No measurable change in {outcome}: it stays at about {_pct(base)} over "
            f"the {horizon}-year horizon on these assumptions."
        )
    else:
        number_text = (
            f"{_pp(effect)} means {abs(effect):.2f} more electric vehicles in every "
            f"100 newly registered — a {relative:+.0f}% change against today's "
            f"{_pct(base)}, or about {per_year:+.2f} pp a year for {horizon} years."
        )

    reads: list[dict[str, str]] = [
        {"label": "What the number means", "text": number_text},
        {
            "label": "How sure the model is",
            "text": (
                f"The 95% range runs {_pp(ci_low)} to {_pp(ci_high)}. {unc['text']}"
            ),
        },
    ]

    dist_note = _distribution_note(model.get("distribution") or {})
    if dist_note:
        reads.append({"label": "Who gains most", "text": dist_note})

    driver_note = _driver_note(model.get("sensitivity") or {}, unit)
    if driver_note:
        reads.append({"label": "What moves the result", "text": driver_note})

    tgt_note = _target_note(levers)
    if tgt_note:
        reads.append({"label": "About the stated target", "text": tgt_note})

    if mix["low"]:
        reads.append({
            "label": "Where to be careful",
            "text": (
                f"{mix['low']} of {len(states)} state projections carry a low-confidence "
                "flag, meaning their interval is wider than their projected gain. Read "
                "those states as directional only."
            ),
        })

    # What a reader should check before quoting the number. These are the model's
    # real structural limits, stated as questions a sceptic would ask.
    caveats = [
        (
            f"This is a projection, not a measurement: it applies a slope fitted on "
            f"historical state adoption to a {horizon}-year forward scenario."
        ),
        (
            "The projection assumes the policy is implemented as parsed and that "
            "nothing else about the vehicle market changes."
        ),
    ]
    if horizon > 6:
        caveats.append(
            f"A {horizon}-year horizon extrapolates well beyond the exposure window the "
            "calibration observes, which is why the interval is widened at long horizons."
        )
    if unc["includes_no_change"] and unc["label"] != "pinned":
        caveats.append(
            "The 95% range includes no change, so \"this policy might not move the "
            "needle\" is inside the model's own range of outcomes."
        )

    return {
        "one_liner": one_liner,
        "relative_change_pct": round(relative, 1),
        "per_year_effect": round(per_year, 3),
        "reads": reads,
        "uncertainty": unc,
        "confidence_mix": mix,
        "caveats": caveats,
        # Terms the panel uses, defined once so the UI can offer them inline.
        "glossary": [
            {
                "term": "percentage point (pp)",
                "definition": (
                    "The arithmetic difference between two percentages. Going from 8% "
                    "to 10% is +2 pp, which is a 25% relative increase."
                ),
            },
            {
                "term": "95% interval",
                "definition": (
                    "The range the model considers plausible for the effect. It reflects "
                    "uncertainty in the fitted response only — not the risk that the "
                    "model's assumptions are wrong."
                ),
            },
            {
                "term": "saturation ceiling",
                "definition": (
                    "The assumed long-run maximum share. Gains shrink as a state "
                    "approaches it, so the same policy does less where adoption is "
                    "already high."
                ),
            },
        ],
    }

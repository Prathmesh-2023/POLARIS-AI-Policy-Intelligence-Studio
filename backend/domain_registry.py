"""Policy-aware domain routing (POLARIS Modification Notes sections 2, 3).

Maps a parsed policy to a support level that decides whether the quantitative
model runs:

  supported   -> a validated quantitative model exists  -> run it
  partial     -> model exists but with caveats           -> run w/ wider bands
  unsupported -> no validated model                      -> qualitative RAG+LLM
                                                            (NEVER invent numbers)

Only EV / transportation is `supported` in this build (its TWFE/DiD model is the
critical path). Everything else is `unsupported` until a validated model exists.
"""
from __future__ import annotations

from typing import Any

# domain key -> routing
DOMAIN_REGISTRY: dict[str, dict[str, str]] = {
    "ev_transport": {"support_level": "supported", "model": "twfe_did"},
    # "solar": {"support_level": "partial", "model": "twfe_did"},  # future stretch
}

_EV_KEYWORDS = (
    "electric vehicle", "electric-vehicle", "electric two", "electric three",
    "electric wheeler", "e-wheeler", "two-wheeler", "three-wheeler", "2-wheeler",
    "3-wheeler", "e-2w", "e-3w", " ev ", "evs", "e-mobility", "electric mobility",
    "electric car", "electric bus", "electric scooter", "fame", "pm e-drive",
    "charging station", "charging infrastructure", "battery swapping", "ev subsidy",
    "electric rickshaw", "e-rickshaw",
)
_TRANSPORT_HINT = ("transport", "mobility", "vehicle", "automobile", "automotive")


def classify_domain(policy_text: str, parsed: dict[str, Any]) -> dict[str, Any]:
    """Return {domain_key, support_level, model, label, rationale}."""
    text = f" {policy_text.lower()} "
    parsed_domain = str(parsed.get("domain") or "").lower()
    sectors = " ".join(str(s).lower() for s in (parsed.get("affected_sectors") or []))
    blob = f"{text} {parsed_domain} {sectors}"

    ev_hit = any(k in blob for k in _EV_KEYWORDS)
    transport_hit = any(k in blob for k in _TRANSPORT_HINT)
    is_ev = ev_hit or (transport_hit and ("electric" in blob or "emission" in blob))

    if is_ev:
        reg = DOMAIN_REGISTRY["ev_transport"]
        return {
            "domain_key": "ev_transport",
            "support_level": reg["support_level"],
            "model": reg["model"],
            "label": "EV / Transportation",
            "rationale": (
                "Policy targets electric-vehicle / transportation outcomes, for "
                "which a validated staggered-adoption TWFE/DiD model exists. The "
                "quantitative model produces the state-level predictions; the LLM "
                "interprets those numbers rather than inventing its own."
            ),
        }
    return {
        "domain_key": "other",
        "support_level": "unsupported",
        "model": None,
        "label": parsed.get("domain") or "General policy",
        "rationale": (
            "No validated quantitative model exists for this policy domain yet, so "
            "POLARIS returns a qualitative evidence-based assessment only and does "
            "not fabricate state-level numeric predictions."
        ),
    }

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

RunStatus = Literal[
    "pending",
    "parsing",
    "modeling",
    "fetching_data",
    "analyzing",
    "debating",
    "synthesizing",
    "complete",
    "error",
]
AgentStatus = Literal["pending", "running", "done", "error"]
RiskLevel = Literal["Low", "Medium", "High"]
Direction = Literal["up", "down", "flat"]
Magnitude = Literal["small", "moderate", "large"]


class CreateRunRequest(BaseModel):
    policy_text: str = Field(min_length=1)
    domain_hint: str | None = None
    # Optional user-supplied overrides for the parsed policy levers. When present
    # (a "re-run with these levers" from the Understood-as card) they replace the
    # LLM-parsed levers before modelling, so the user can correct a misread policy.
    lever_overrides: dict[str, Any] | None = None


class CreateRunResponse(BaseModel):
    run_id: str


class ComparePolicyVariant(BaseModel):
    """One side of an A/B quantitative comparison. All fields optional; unset
    levers fall back to a sensible reference (medium incentives, low infra, 5-yr)."""
    label: str | None = None
    incentive_strength: str | None = None
    infrastructure_push: str | None = None
    target_penetration_pct: float | None = None
    horizon_years: int | None = None


class CompareRequest(BaseModel):
    a: ComparePolicyVariant
    b: ComparePolicyVariant


class HealthResponse(BaseModel):
    status: str


def empty_agents() -> dict[str, dict[str, Any]]:
    slot = {"status": "pending", "output": None}
    return {
        "economic": dict(slot),
        "environment": dict(slot),
        "social": dict(slot),
        "risk": dict(slot),
    }


def new_run_payload(
    run_id: str,
    policy_text: str,
    domain_hint: str | None,
    lever_overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "run_id": run_id,
        "status": "pending",
        "policy_input": {
            "policy_text": policy_text,
            "domain_hint": domain_hint,
            "lever_overrides": lever_overrides,
        },
        "parsed_policy": None,
        "classification": None,
        "agents": empty_agents(),
        "synthesis": None,
        "state_impact": None,
        "state_impact_source": None,
        "model_summary": None,
        "model_predictions": None,
        "evidence": None,
        "debate": None,
        "error": None,
    }

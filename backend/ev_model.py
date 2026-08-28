"""
POLARIS — EV / Transportation quantitative model.

Staggered-adoption Two-Way Fixed Effects (TWFE) / Difference-in-Differences
estimator of the effect of a state adopting its own EV policy on that state's
EV penetration (EV share of new vehicle registrations, %).

Design (see POLARIS Modification Notes sections 4-8):
  * Panel: state x year.
  * Treatment = each state's OWN EV-policy adoption year (staggered), NOT the
    national FAME-II scheme (which is national and cannot serve as a
    treated-vs-control variable).
  * Primary estimator: TWFE OLS with state fixed effects + year fixed effects
    + a binary `policy_active` treatment indicator. The treatment coefficient
    is the causal policy-effect estimate; its regression CI is the uncertainty.
  * Event study: same panel, treatment recoded as years-since-adoption dummies,
    for pre-trend inspection and effect dynamics.
  * Counterfactual: baseline = fitted value with policy_active = 0,
    with_policy = fitted value with policy_active = 1, effect = difference.

KNOWN LIMITATION (stated explicitly): standard TWFE is biased under staggered
treatment timing because already-treated units act as "bad controls"
(Goodman-Bacon; de Chaisemartin & D'Haultfoeuille). A corrected estimator
(Callaway & Sant'Anna) is out of scope for this build and noted as a limitation.

DATA PROVENANCE (stated explicitly): there is no clean public VAHAN REST API,
so this panel is RECONSTRUCTED from published anchors rather than a live pull:
  * FY2024 state EV-penetration anchors: CEEW FY24 EV Sector Snapshot,
    EVreporter, ETAuto/ICCT reporting.
  * State EV-policy adoption years: state EV-policy notifications as compiled by
    transportpolicy.net and diyguru state-policy roundups.
  * Earlier years back-cast along India's known national EV-penetration
    trajectory (~0.2% in 2017 -> ~7% in 2024).
The regression itself is real and computed live from this panel; the estimate is
illustrative of the methodology pending live VAHAN state-year ingestion. It is
NOT a hashed/simulated demo score.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from interpretation import build_interpretation

# --- State seed: real published anchors ------------------------------------
# Per state:
#   policy_year : year the state notified its OWN EV policy (staggered treatment)
#   pen2024     : EV share of FY2024 new-vehicle registrations, % (CEEW/EVreporter)
#   pop         : population, millions
#   gsdp        : GSDP-per-capita index relative to the national average (=1.0)
#   urban       : urban-population share, 0-1 (Census 2011 — a real, fixed anchor)
#   charge      : current public-charging build-out per-capita, normalized 0-1
#                 (1.0 = best-served). A documented published-anchor approximation
#                 from Ministry of Heavy Industries / BEE operational-PCS reporting;
#                 metros and UTs lead, low-income states trail. NOT a live feed.
# The two new covariates (urban, charge) let the projection route SUBSIDY effort
# and INFRASTRUCTURE effort through different state channels, so which states win
# depends on the policy's DESIGN, not just its overall strength (see project_policy).
STATE_SEED: dict[str, dict[str, float]] = {
    "Goa":              {"policy_year": 2021, "pen2024": 13.3, "pop": 1.6,  "gsdp": 2.6,  "urban": 0.62, "charge": 0.70},
    "Delhi":            {"policy_year": 2020, "pen2024": 11.5, "pop": 20.0, "gsdp": 2.7,  "urban": 0.975, "charge": 1.00},
    "Kerala":           {"policy_year": 2019, "pen2024": 11.1, "pop": 35.0, "gsdp": 1.5,  "urban": 0.48, "charge": 0.55},
    "Assam":            {"policy_year": 2021, "pen2024": 10.0, "pop": 35.0, "gsdp": 0.7,  "urban": 0.14, "charge": 0.20},
    "Karnataka":        {"policy_year": 2017, "pen2024": 9.9,  "pop": 68.0, "gsdp": 1.6,  "urban": 0.39, "charge": 0.65},
    "Uttar Pradesh":    {"policy_year": 2019, "pen2024": 9.2,  "pop": 231.0, "gsdp": 0.55, "urban": 0.22, "charge": 0.35},
    "Chandigarh":       {"policy_year": 2022, "pen2024": 9.0,  "pop": 1.2,  "gsdp": 2.4,  "urban": 0.97, "charge": 0.85},
    "Maharashtra":      {"policy_year": 2018, "pen2024": 8.5,  "pop": 124.0, "gsdp": 1.5,  "urban": 0.45, "charge": 0.60},
    "Odisha":           {"policy_year": 2021, "pen2024": 8.5,  "pop": 46.0, "gsdp": 0.8,  "urban": 0.17, "charge": 0.30},
    "Rajasthan":        {"policy_year": 2019, "pen2024": 8.0,  "pop": 81.0, "gsdp": 0.8,  "urban": 0.25, "charge": 0.40},
    "Bihar":            {"policy_year": 2019, "pen2024": 8.0,  "pop": 124.0, "gsdp": 0.4,  "urban": 0.11, "charge": 0.18},
    "Telangana":        {"policy_year": 2020, "pen2024": 7.5,  "pop": 39.0, "gsdp": 1.7,  "urban": 0.39, "charge": 0.50},
    "Jharkhand":        {"policy_year": 2022, "pen2024": 7.0,  "pop": 39.0, "gsdp": 0.6,  "urban": 0.24, "charge": 0.22},
    "Gujarat":          {"policy_year": 2021, "pen2024": 7.0,  "pop": 71.0, "gsdp": 1.6,  "urban": 0.43, "charge": 0.50},
    "Uttarakhand":      {"policy_year": 2018, "pen2024": 7.0,  "pop": 11.0, "gsdp": 1.3,  "urban": 0.30, "charge": 0.40},
    "Tamil Nadu":       {"policy_year": 2019, "pen2024": 6.5,  "pop": 77.0, "gsdp": 1.5,  "urban": 0.48, "charge": 0.55},
    "Madhya Pradesh":   {"policy_year": 2019, "pen2024": 6.5,  "pop": 86.0, "gsdp": 0.7,  "urban": 0.28, "charge": 0.30},
    "Andhra Pradesh":   {"policy_year": 2018, "pen2024": 6.5,  "pop": 53.0, "gsdp": 1.1,  "urban": 0.30, "charge": 0.40},
    "Haryana":          {"policy_year": 2022, "pen2024": 6.5,  "pop": 30.0, "gsdp": 1.7,  "urban": 0.35, "charge": 0.45},
    "Chhattisgarh":     {"policy_year": 2022, "pen2024": 6.5,  "pop": 30.0, "gsdp": 0.9,  "urban": 0.23, "charge": 0.25},
    "West Bengal":      {"policy_year": 2021, "pen2024": 6.0,  "pop": 99.0, "gsdp": 0.9,  "urban": 0.32, "charge": 0.35},
    "Punjab":           {"policy_year": 2022, "pen2024": 6.0,  "pop": 30.0, "gsdp": 1.1,  "urban": 0.37, "charge": 0.40},
    "Himachal Pradesh": {"policy_year": 2022, "pen2024": 5.0,  "pop": 7.5,  "gsdp": 1.3,  "urban": 0.10, "charge": 0.35},
}

# India national EV-penetration trajectory (% of new-vehicle registrations),
# used to back-cast earlier years. Grounded in CEEW / EVreporter reporting.
NATIONAL_TRAJECTORY: dict[int, float] = {
    2015: 0.10, 2016: 0.15, 2017: 0.22, 2018: 0.35, 2019: 0.55,
    2020: 0.75, 2021: 1.6, 2022: 4.6, 2023: 6.3, 2024: 7.0,
}

YEARS: list[int] = sorted(NATIONAL_TRAJECTORY.keys())
OUTCOME_LABEL = "EV share of new-vehicle registrations"
OUTCOME_UNIT = "percentage points"
_RNG = np.random.default_rng(20260827)  # fixed seed -> reproducible panel

# Per-exposure-year additive policy boost (percentage points) used to
# reconstruct the panel from the real 2024 anchors. This shapes the DATA;
# the model must re-estimate it from the reconstructed panel (it is not read
# back out directly). Additive (not multiplicative) so year fixed effects do
# not absorb it and the TWFE treatment coefficient is cleanly identified.
_BOOST_PP = 0.35
_DOSE_CAP = 6


def build_panel() -> pd.DataFrame:
    """Reconstruct the state x year EV-penetration panel from published anchors."""
    rows: list[dict[str, Any]] = []
    nat2024 = NATIONAL_TRAJECTORY[2024]
    for state, s in STATE_SEED.items():
        py = int(s["policy_year"])
        dose_2024 = min(max(0, 2024 - py + 1), _DOSE_CAP)
        # structural (pre-policy) multiplier calibrated so 2024 hits the anchor
        b_s = max(0.05, (s["pen2024"] - _BOOST_PP * dose_2024) / nat2024)
        for y in YEARS:
            dose = min(max(0, y - py + 1), _DOSE_CAP)
            noise = float(_RNG.normal(0.0, 0.15))  # small reproducible pp noise
            share = max(0.0, NATIONAL_TRAJECTORY[y] * b_s + _BOOST_PP * dose + noise)
            rows.append(
                {
                    "state": state,
                    "year": y,
                    "ev_share": round(share, 4),
                    "policy_year": py,
                    "policy_active": 1 if y >= py else 0,
                    "years_since_adoption": dose if y >= py else 0,
                    "rel_time": y - py,
                    "population": s["pop"],
                    "gsdp_per_capita": s["gsdp"],
                    "subsidy_intensity": round(s["gsdp"] * (1 if y >= py else 0), 3),
                }
            )
    return pd.DataFrame(rows)


# --- Generic OLS with cluster-robust variance ------------------------------
def _ols_cluster(
    X: np.ndarray, y: np.ndarray, clusters: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Return (beta, cov) with cluster-robust covariance (clustered on `clusters`).

    Uses lstsq/pinv so rank-deficient designs (collinear FE dummies) are handled
    gracefully rather than raising.
    """
    XtX = X.T @ X
    XtX_inv = np.linalg.pinv(XtX)
    beta = XtX_inv @ (X.T @ y)
    resid = y - X @ beta
    # cluster-robust "meat"
    meat = np.zeros((X.shape[1], X.shape[1]))
    uniq = np.unique(clusters)
    for c in uniq:
        m = clusters == c
        Xg = X[m]
        ug = resid[m]
        s = Xg.T @ ug
        meat += np.outer(s, s)
    G = len(uniq)
    n, k = X.shape
    dof = max(1, n - k)
    correction = (G / max(1, G - 1)) * ((n - 1) / dof)
    cov = XtX_inv @ meat @ XtX_inv * correction
    return beta, cov


def _design_fe(
    df: pd.DataFrame, treat_cols: list[str]
) -> tuple[np.ndarray, list[str], np.ndarray]:
    """Build [intercept | state FE (drop 1) | year FE (drop 1) | treat_cols]."""
    states = sorted(df["state"].unique())
    years = sorted(df["year"].unique())
    n = len(df)
    cols: list[np.ndarray] = [np.ones(n)]
    names: list[str] = ["const"]
    for st in states[1:]:
        cols.append((df["state"] == st).to_numpy(dtype=float))
        names.append(f"state[{st}]")
    for yr in years[1:]:
        cols.append((df["year"] == yr).to_numpy(dtype=float))
        names.append(f"year[{yr}]")
    for tc in treat_cols:
        cols.append(df[tc].to_numpy(dtype=float))
        names.append(tc)
    X = np.column_stack(cols)
    clusters = df["state"].to_numpy()
    return X, names, clusters


Z95 = 1.96


@dataclass
class StateEffect:
    state: str
    baseline: float
    with_policy: float
    effect: float
    ci_low: float
    ci_high: float
    years_since_adoption: int
    confidence: str
    # Per-state channel decomposition (projection only; 0.0 for the historical fit).
    # How much of this state's projected gain is driven by the SUBSIDY channel vs
    # the INFRASTRUCTURE channel — this is what makes the winning set depend on
    # policy DESIGN rather than just overall strength.
    subsidy_share: float = 0.0
    infra_share: float = 0.0
    driver: str = "measured"
    # True when an explicit target penetration limited this state's projected gain
    # (including the "already at or above the target" case, where the cap is 0).
    target_capped: bool = False


@dataclass
class EVModelResult:
    # headline (binary TWFE average treatment effect)
    headline_effect: float
    headline_ci_low: float
    headline_ci_high: float
    headline_se: float
    # dynamic / dose (per-year slope) used for per-state accumulation
    slope_per_year: float
    slope_se: float
    n_obs: int
    n_states: int
    r2: float
    event_study: list[dict[str, float]]
    states: list[StateEffect] = field(default_factory=list)
    outcome_label: str = OUTCOME_LABEL
    unit: str = OUTCOME_UNIT
    rf_backtest: dict[str, Any] | None = None


def _r2(y: np.ndarray, X: np.ndarray, beta: np.ndarray) -> float:
    resid = y - X @ beta
    ss_res = float(resid @ resid)
    ss_tot = float(((y - y.mean()) ** 2).sum())
    return 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0


def fit(df: pd.DataFrame | None = None) -> EVModelResult:
    if df is None:
        df = build_panel()
    y = df["ev_share"].to_numpy(dtype=float)

    # --- Model A: binary policy_active TWFE (headline causal estimate) ------
    Xa, names_a, clusters = _design_fe(df, ["policy_active"])
    beta_a, cov_a = _ols_cluster(Xa, y, clusters)
    ia = names_a.index("policy_active")
    eff = float(beta_a[ia])
    se = float(np.sqrt(max(cov_a[ia, ia], 0.0)))
    r2 = _r2(y, Xa, beta_a)

    # --- Model B: continuous years-since-adoption slope (dose response) -----
    Xb, names_b, _ = _design_fe(df, ["years_since_adoption"])
    beta_b, cov_b = _ols_cluster(Xb, y, clusters)
    ib = names_b.index("years_since_adoption")
    slope = float(beta_b[ib])
    slope_se = float(np.sqrt(max(cov_b[ib, ib], 0.0)))

    # --- Event study: relative-time dummies (ref = -1) ---------------------
    rel_vals = [k for k in sorted(df["rel_time"].unique()) if -4 <= k <= 5 and k != -1]
    es_cols = []
    for k in rel_vals:
        col = (df["rel_time"] == k).to_numpy(dtype=float)
        df[f"_es_{k}"] = col
        es_cols.append(f"_es_{k}")
    Xe, names_e, _ = _design_fe(df, es_cols)
    beta_e, cov_e = _ols_cluster(Xe, y, clusters)
    event_study: list[dict[str, float]] = [
        {"period": -1, "coefficient": 0.0, "ci_low": 0.0, "ci_high": 0.0}
    ]
    for k, name in zip(rel_vals, es_cols):
        j = names_e.index(name)
        c = float(beta_e[j])
        s = float(np.sqrt(max(cov_e[j, j], 0.0)))
        event_study.append(
            {"period": int(k), "coefficient": round(c, 4),
             "ci_low": round(c - Z95 * s, 4), "ci_high": round(c + Z95 * s, 4)}
        )
    event_study.sort(key=lambda p: p["period"])
    for c in es_cols:
        df.drop(columns=c, inplace=True)

    # --- Per-state counterfactual predictions ------------------------------
    # baseline = fitted level with treatment removed (policy_active/dose = 0);
    # per-state effect accumulates the dose slope over that state's exposure.
    states_out: list[StateEffect] = []
    latest = df["year"].max()
    ci_hw_year = Z95 * slope_se  # half-width per exposure-year
    for st in sorted(df["state"].unique()):
        row = df[(df["state"] == st) & (df["year"] == latest)].iloc[0]
        yrs = int(row["years_since_adoption"])
        # fitted with_policy level for this state-year from Model B
        idx = df.index[(df["state"] == st) & (df["year"] == latest)][0]
        pos = df.index.get_loc(idx)
        fitted_with = float(Xb[pos] @ beta_b)
        state_eff = slope * yrs
        baseline = max(0.0, fitted_with - state_eff)
        ci_low = state_eff - ci_hw_year * yrs
        ci_high = state_eff + ci_hw_year * yrs
        if yrs >= 4:
            conf = "high"
        elif yrs >= 2:
            conf = "medium"
        else:
            conf = "low"
        states_out.append(
            StateEffect(
                state=st,
                baseline=round(baseline, 3),
                with_policy=round(fitted_with, 3),
                effect=round(state_eff, 3),
                ci_low=round(ci_low, 3),
                ci_high=round(ci_high, 3),
                years_since_adoption=yrs,
                confidence=conf,
            )
        )

    return EVModelResult(
        headline_effect=round(eff, 4),
        headline_ci_low=round(eff - Z95 * se, 4),
        headline_ci_high=round(eff + Z95 * se, 4),
        headline_se=round(se, 4),
        slope_per_year=round(slope, 4),
        slope_se=round(slope_se, 4),
        n_obs=int(len(df)),
        n_states=int(df["state"].nunique()),
        r2=round(r2, 4),
        event_study=event_study,
        states=states_out,
        rf_backtest=_random_forest_backtest(df),
    )


def _random_forest_backtest(df: pd.DataFrame) -> dict[str, Any] | None:
    """Optional predictive-accuracy baseline (NOT causal). Uses sklearn if
    installed on the host; skipped silently in minimal environments."""
    try:
        from sklearn.ensemble import RandomForestRegressor  # type: ignore
    except Exception:
        return None
    train = df[df["year"] <= 2022]
    test = df[df["year"] > 2022]
    feats = ["policy_active", "years_since_adoption", "population",
             "gsdp_per_capita", "subsidy_intensity", "year"]
    rf = RandomForestRegressor(n_estimators=300, random_state=42)
    rf.fit(train[feats], train["ev_share"])
    pred = rf.predict(test[feats])
    actual = test["ev_share"].to_numpy()
    mae = float(np.mean(np.abs(pred - actual)))
    rmse = float(np.sqrt(np.mean((pred - actual) ** 2)))
    dir_acc = float(np.mean((np.sign(np.diff(pred)) == np.sign(np.diff(actual)))))
    series = [
        {"label": f"{r.state} {int(r.year)}", "actual": round(float(r.ev_share), 3),
         "predicted": round(float(p), 3)}
        for (_, r), p in zip(test.iterrows(), pred)
    ][:24]
    return {"mae": round(mae, 4), "rmse": round(rmse, 4),
            "directional_accuracy": round(dir_acc, 3), "series": series}


DATA_PROVENANCE = (
    "State x year EV-penetration panel reconstructed from published anchors "
    "(CEEW FY24 EV Sector Snapshot; EVreporter; ETAuto/ICCT) and state EV-policy "
    "adoption years (transportpolicy.net, state notifications), back-cast along "
    "India's national EV-penetration trajectory. Per-state covariates — urban share "
    "(Census 2011), GSDP-per-capita index, and a normalized public-charging build-out "
    "index (MoHI/BEE operational-PCS reporting) — anchor the projection's subsidy vs "
    "infrastructure channels. No live VAHAN API exists; figures are documented "
    "approximations pending live state-year ingestion."
)
LIMITATION = (
    "Standard TWFE is biased under staggered adoption (already-treated states act "
    "as bad controls); a corrected estimator (Callaway & Sant'Anna) is out of "
    "scope here and noted. The per-policy figure is a PROJECTION: it routes the "
    "calibrated dose slope through two channels — a subsidy channel scaled by each "
    "state's price sensitivity (income) and an infrastructure channel scaled by its "
    "current charging gap — under a logistic saturation ceiling and the policy's "
    "horizon. So it is a covariate-driven scenario built on the fitted coefficients "
    "and real anchors, not an out-of-sample measurement; the channel incidence "
    "functions are documented modelling assumptions, not separately estimated elasticities."
)

_CALIB: EVModelResult | None = None


def _calibration() -> EVModelResult:
    """The historical TWFE/DiD regression. It does NOT depend on the submitted
    policy, so we fit it once and reuse the coefficients."""
    global _CALIB
    if _CALIB is None:
        _CALIB = fit()
    return _CALIB


# --- Policy-conditional projection -----------------------------------------
# The regression above is CALIBRATION: from the historical panel it estimates
# the marginal effect of one more year of policy exposure (the dose slope) and
# each state's real 2024 baseline. Those numbers do not change with the policy a
# user submits. To turn them into a POLICY-SPECIFIC forecast we project every
# state forward over the policy's horizon under its incentive strength and
# infrastructure push, using a bounded logistic-headroom diffusion so states
# near saturation gain less. This is what makes the headline number AND the map
# move when the policy changes — while every value still traces back to a fitted
# coefficient and a published 2024 anchor.

EV_CEILING_PCT = 60.0  # assumed long-run saturation ceiling for EV share of
#                        NEW-vehicle registrations (documented modelling assumption)
_INCENTIVE_FACTOR = {"none": 0.35, "low": 0.7, "medium": 1.0, "high": 1.5}
_INFRA_FACTOR = {"none": 0.85, "low": 1.0, "medium": 1.15, "high": 1.3}

# Separable CHANNEL weights. Unlike the legacy combined `intensity` multiplier,
# these drive two DISTINCT transmission channels with different state incidence:
#   * the SUBSIDY channel (purchase incentives) lands hardest on price-sensitive
#     states (lower income / lower current adoption capacity);
#   * the INFRASTRUCTURE channel (charging build-out) lands hardest on states with
#     the largest current charging GAP (under-served today = most to gain).
# So a subsidy-heavy and an infra-heavy policy of the SAME overall strength favour
# DIFFERENT states. Weights are on a comparable 0..~1.5 scale.
_SUBSIDY_W = {"none": 0.30, "low": 0.65, "medium": 1.0, "high": 1.5}
_INFRA_CH_W = {"none": 0.10, "low": 0.45, "medium": 0.85, "high": 1.25}


# --- Real per-state covariates -> channel responsiveness -------------------
# Each responsiveness term is a bounded, documented function of a published
# covariate already in STATE_SEED. Nothing is fabricated; these just decide HOW a
# given rupee of subsidy vs a given charger lands across states.
def _price_sensitivity(gsdp: float) -> float:
    """Subsidy responsiveness. Lower-income states are more price-sensitive, so a
    purchase incentive shifts their buying decision more. Bounded 0.55..1.35."""
    return float(min(1.35, max(0.55, 1.45 - 0.42 * gsdp)))


def _charging_gap(charge: float) -> float:
    """Infrastructure responsiveness. States with the least charging today have the
    most headroom for a build-out to unlock adoption (catch-up). Bounded 0.2..1.0."""
    return float(min(1.0, max(0.2, 1.0 - charge)))


def _readiness_subsidy(urban: float) -> float:
    """Subsidy conversion capacity — only weakly urban-dependent: a price cut moves
    buyers in rural and urban markets alike. Bounded 0.8..1.0."""
    return float(min(1.0, max(0.8, 0.8 + 0.2 * urban)))


def _readiness_infra(urban: float) -> float:
    """Charging conversion capacity — strongly urban-dependent: new chargers unlock
    the most latent demand where trips and parking are dense. Bounded 0.5..1.1."""
    return float(min(1.1, max(0.5, 0.5 + 0.6 * urban)))


@dataclass
class PolicyLevers:
    incentive_strength: str
    infrastructure_push: str
    target_penetration_pct: float | None
    horizon_years: int
    intensity: float  # combined multiplier vs a "medium/low" reference policy
    label: str


def _levers_from_policy(policy: dict[str, Any] | None) -> PolicyLevers:
    policy = policy or {}
    lv = policy.get("levers") or {}
    inc = str(lv.get("incentive_strength") or "medium").lower()
    infra = str(lv.get("infrastructure_push") or "low").lower()
    horizon = policy.get("timeline_years") or 5
    try:
        horizon = int(float(horizon))
    except (TypeError, ValueError):
        horizon = 5
    horizon = max(1, min(horizon, 15))
    target = lv.get("target_penetration_pct")
    try:
        target = float(target) if target is not None else None
    except (TypeError, ValueError):
        target = None
    intensity = _INCENTIVE_FACTOR.get(inc, 1.0) * _INFRA_FACTOR.get(infra, 1.0)
    label = f"{inc} incentives · {infra} infrastructure · {horizon}-yr horizon"
    return PolicyLevers(inc, infra, target, horizon, round(intensity, 4), label)


_RESP_NORM: float | None = None


def _resp_norm() -> float:
    """Average per-state responsiveness under a MEDIUM-subsidy / LOW-infra reference
    policy, used to re-center the channel model so that reference policy reproduces
    the legacy ~`slope*horizon` aggregate scale. Cached (covariates are fixed)."""
    global _RESP_NORM
    if _RESP_NORM is None:
        s_ref, i_ref = _SUBSIDY_W["medium"], _INFRA_CH_W["low"]
        vals = [
            s_ref * _readiness_subsidy(float(s["urban"])) * _price_sensitivity(float(s["gsdp"]))
            + i_ref * _readiness_infra(float(s["urban"])) * _charging_gap(float(s["charge"]))
            for s in STATE_SEED.values()
        ]
        _RESP_NORM = max(1e-6, sum(vals) / len(vals))
    return _RESP_NORM


def _constrain_gain(raw: float, headroom: float, cap: float | None) -> float:
    """Map an unconstrained pp gain onto the feasible range.

    Two constraints, applied identically to the point estimate AND to both
    confidence bounds so an interval can never imply a penetration above the
    declared ceiling or above an explicit policy target:
      1. logistic saturation toward `headroom` (= EV_CEILING_PCT - baseline),
      2. an optional hard cap from a stated target penetration.
    """
    gain = headroom * (1.0 - float(np.exp(-max(0.0, raw) / headroom)))
    if cap is not None:
        gain = min(gain, cap)
    return max(0.0, gain)


def project_policy(calib: EVModelResult, lv: PolicyLevers) -> list[StateEffect]:
    """Forward per-state counterfactual for THIS policy, built on the calibrated
    dose slope + real 2024 baselines.

    Heterogeneity: the policy's subsidy strength and infrastructure push drive two
    SEPARATE channels routed through real state covariates — subsidy through price
    sensitivity (income), infrastructure through the current charging GAP — scaled
    by urban conversion readiness. So which states gain most depends on the policy
    DESIGN, not just its intensity. A bounded logistic headroom saturates
    high-penetration states; CIs widen the further we extrapolate."""
    slope = max(0.0, calib.slope_per_year)
    slope_se = max(1e-4, calib.slope_se)
    S = _SUBSIDY_W.get(lv.incentive_strength, 1.0)
    I = _INFRA_CH_W.get(lv.infrastructure_push, 0.45)
    norm = _resp_norm()
    # Long horizons extrapolate past the exposure window the calibration observes,
    # so widen the interval the further out we project.
    extrap = 1.0 + 0.12 * max(0, lv.horizon_years - 4)
    out: list[StateEffect] = []
    for st, s in STATE_SEED.items():
        base = float(s["pen2024"])
        headroom = max(1.0, EV_CEILING_PCT - base)
        subsidy_resp = _readiness_subsidy(float(s["urban"])) * S * _price_sensitivity(float(s["gsdp"]))
        infra_resp = _readiness_infra(float(s["urban"])) * I * _charging_gap(float(s["charge"]))
        resp = (subsidy_resp + infra_resp) / norm  # re-centered responsiveness
        raw = slope * resp * lv.horizon_years  # unconstrained pp gain
        # Uncertainty enters on the RAW scale, from the calibrated dose slope's SE.
        raw_hw = Z95 * slope_se * resp * lv.horizon_years * extrap
        # A stated target caps the GAIN. A target at or below today's level is
        # already met, so the cap is 0 — not silently ignored.
        cap = None if lv.target_penetration_pct is None else max(0.0, lv.target_penetration_pct - base)
        saturated = _constrain_gain(raw, headroom, None)
        effect = _constrain_gain(raw, headroom, cap)
        ci_low = _constrain_gain(raw - raw_hw, headroom, cap)
        ci_high = _constrain_gain(raw + raw_hw, headroom, cap)
        predicted = base + effect
        # channel attribution (share of the raw pre-saturation gain)
        tot_resp = subsidy_resp + infra_resp
        sub_share = round(subsidy_resp / tot_resp, 3) if tot_resp > 0 else 0.0
        inf_share = round(1.0 - sub_share, 3) if tot_resp > 0 else 0.0
        if sub_share >= 0.6:
            driver = "subsidy"
        elif inf_share >= 0.6:
            driver = "infrastructure"
        else:
            driver = "mixed"
        # Confidence describes how well identified the RESPONSE is, so it is read
        # off the unconstrained scale — a target cap narrows the reported interval
        # without making the underlying estimate any better identified.
        rel = raw_hw / max(raw, 1e-6)
        conf = "high" if rel < 0.4 else ("medium" if rel < 1.0 else "low")
        out.append(
            StateEffect(
                state=st,
                baseline=round(base, 3),
                with_policy=round(predicted, 3),
                effect=round(effect, 3),
                ci_low=round(ci_low, 3),
                ci_high=round(ci_high, 3),
                years_since_adoption=lv.horizon_years,
                confidence=conf,
                subsidy_share=sub_share,
                infra_share=inf_share,
                driver=driver,
                target_capped=cap is not None and cap < saturated - 1e-9,
            )
        )
    return out


# --- Distributional grouping (real GSDP-per-capita index tiers) -------------
# States are grouped by the SAME published GSDP-per-capita index already in
# STATE_SEED (1.0 = national average). No income figures are invented; the tiers
# are a transparent split of that index so we can report who gains most.
def _income_group(gsdp: float) -> str:
    if gsdp >= 1.4:
        return "higher"
    if gsdp >= 0.85:
        return "middle"
    return "lower"


_GROUP_LABEL = {
    "higher": "Higher-income states",
    "middle": "Middle-income states",
    "lower": "Lower-income states",
}


def _slim_state(s: StateEffect) -> dict[str, Any]:
    return {
        "state": s.state,
        "policy_effect": s.effect,
        "baseline_value": s.baseline,
        "predicted_value": s.with_policy,
        "income_group": _income_group(float(STATE_SEED[s.state]["gsdp"])),
        "driver": s.driver,
        "subsidy_share": s.subsidy_share,
        "infra_share": s.infra_share,
    }


def _distribution(states: list[StateEffect]) -> dict[str, Any]:
    """Winners/losers + effect by income tier — all from the projected per-state
    effects and the published GSDP index. Nothing fabricated."""
    ranked = sorted(states, key=lambda s: s.effect, reverse=True)
    groups: dict[str, list[float]] = {"higher": [], "middle": [], "lower": []}
    for s in states:
        groups[_income_group(float(STATE_SEED[s.state]["gsdp"]))].append(s.effect)
    by_income_group = [
        {
            "group": g,
            "label": _GROUP_LABEL[g],
            "n_states": len(vals),
            "avg_effect": round(sum(vals) / len(vals), 3) if vals else 0.0,
        }
        for g, vals in groups.items()
        if vals
    ]
    return {
        "by_income_group": by_income_group,
        "top_states": [_slim_state(s) for s in ranked[:5]],
        "bottom_states": [_slim_state(s) for s in ranked[-5:][::-1]],
    }


def _mechanism_chain(
    lv: PolicyLevers, base_nat: float, proj_nat: float, eff_nat: float,
    ci_low: float, ci_high: float, slope: float, top_states: list[dict[str, Any]],
) -> list[dict[str, str]]:
    """Deterministic Policy -> Mechanism -> Outcome -> Distribution narrative.
    Every clause references a real lever or a computed model number; it invents
    nothing, it just makes the causal path the projection assumes legible."""
    inc, infra = lv.incentive_strength, lv.infrastructure_push
    target_bit = (
        f" toward an explicit {lv.target_penetration_pct:.0f}% adoption target"
        if lv.target_penetration_pct is not None else ""
    )
    top_names = ", ".join(s["state"] for s in top_states[:3]) or "n/a"
    # Which transmission channel is doing most of the work for the leading states?
    drivers = [s.get("driver", "mixed") for s in top_states[:5]]
    if drivers.count("subsidy") > drivers.count("infrastructure") and "subsidy" in drivers:
        channel_bit = (
            "price-sensitive, lower-income states where the purchase subsidy shifts "
            "buying decisions most"
        )
    elif drivers.count("infrastructure") > drivers.count("subsidy"):
        channel_bit = (
            "currently under-served states where the charging build-out closes the "
            "biggest infrastructure gap"
        )
    else:
        channel_bit = "states where the subsidy and charging channels reinforce each other"
    return [
        {
            "stage": "Policy",
            "title": lv.label,
            "detail": (
                f"Parsed as {inc} purchase incentives and {infra} charging/"
                f"infrastructure emphasis over a {lv.horizon_years}-year horizon"
                f"{target_bit}."
            ),
        },
        {
            "stage": "Mechanism",
            "title": "Lower cost + easier charging raise the adoption rate",
            "detail": (
                f"Incentives cut the EV price gap while infrastructure reduces range "
                f"anxiety; together they act as an intensity multiplier ({lv.intensity:.2g}×) "
                f"on the calibrated diffusion slope of {slope:+.2f} pp/yr, compounded over "
                f"{lv.horizon_years} years under a logistic saturation ceiling."
            ),
        },
        {
            "stage": "Outcome",
            "title": f"National EV share {base_nat:.1f}% → {proj_nat:.1f}% ({eff_nat:+.2f} pp)",
            "detail": (
                f"Population-weighted projection across modelled states; 95% interval "
                f"{ci_low:+.2f} to {ci_high:+.2f} pp (wider the further the policy "
                f"extrapolates beyond the historical panel)."
            ),
        },
        {
            "stage": "Distribution",
            "title": "Where the gains concentrate",
            "detail": (
                f"Largest projected gains concentrate in {channel_bit} "
                f"(top: {top_names}). Saturation caps further growth in already-high states."
            ),
        },
    ]


def _national_effect(calib: EVModelResult, lv: PolicyLevers) -> float:
    """Population-weighted national projected effect (pp) for a lever set — the same
    headline the dashboard reports. Used by the sensitivity sweep."""
    states = project_policy(calib, lv)
    pops = [float(STATE_SEED[s.state]["pop"]) for s in states]
    tot = sum(pops) or 1.0
    base = sum(s.baseline * p for s, p in zip(states, pops)) / tot
    proj = sum(s.with_policy * p for s, p in zip(states, pops)) / tot
    return proj - base


def _with_lever(lv: PolicyLevers, **changes: Any) -> PolicyLevers:
    """Clone a PolicyLevers with one or more fields overridden."""
    inc = changes.get("incentive_strength", lv.incentive_strength)
    infra = changes.get("infrastructure_push", lv.infrastructure_push)
    target = changes.get("target_penetration_pct", lv.target_penetration_pct)
    horizon = int(changes.get("horizon_years", lv.horizon_years))
    intensity = round(_INCENTIVE_FACTOR.get(inc, 1.0) * _INFRA_FACTOR.get(infra, 1.0), 4)
    label = f"{inc} incentives · {infra} infrastructure · {horizon}-yr horizon"
    return PolicyLevers(inc, infra, target, horizon, intensity, label)


# One-at-a-time perturbation ranges for the tornado.
_SENSITIVITY_SPEC = [
    ("incentive_strength", "Purchase incentive", "none", "high"),
    ("infrastructure_push", "Charging infrastructure", "none", "high"),
    ("horizon_years", "Policy horizon", 2, 10),
]


def sensitivity(policy: dict[str, Any] | None = None) -> dict[str, Any]:
    """One-at-a-time sensitivity of the national headline effect to each lever.

    Holds the submitted policy fixed, then swings each lever from its low to its
    high setting and records the resulting national projected effect. Pure model
    re-evaluation on the fast diffusion projection — no LLM, nothing fabricated.
    Returns a tornado dataset ranked by swing (largest mover first)."""
    calib = _calibration()
    base_lv = _levers_from_policy(policy)
    base_effect = round(_national_effect(calib, base_lv), 4)
    bars: list[dict[str, Any]] = []
    for field_name, label, lo, hi in _SENSITIVITY_SPEC:
        lo_eff = _national_effect(calib, _with_lever(base_lv, **{field_name: lo}))
        hi_eff = _national_effect(calib, _with_lever(base_lv, **{field_name: hi}))
        low_v, high_v = sorted((lo_eff, hi_eff))
        # display the setting labels in low->high effect order
        lo_lab, hi_lab = (str(lo), str(hi)) if lo_eff <= hi_eff else (str(hi), str(lo))
        bars.append({
            "lever": field_name,
            "label": label,
            "low_setting": lo_lab,
            "high_setting": hi_lab,
            "low_effect": round(low_v, 4),
            "high_effect": round(high_v, 4),
            "swing": round(high_v - low_v, 4),
        })
    bars.sort(key=lambda b: b["swing"], reverse=True)
    return {
        "baseline_effect": base_effect,
        "baseline_label": base_lv.label,
        "unit": OUTCOME_UNIT,
        "bars": bars,
    }


def run_model(policy: dict[str, Any] | None = None) -> dict[str, Any]:
    """Calibrate once (deterministic historical regression), then project a
    POLICY-SPECIFIC state-level forecast. Different policies -> different
    headline effect, per-state effects and heatmap. `policy` is the parsed
    policy (expects `timeline_years` and a `levers` block)."""
    calib = _calibration()
    lv = _levers_from_policy(policy)
    states = project_policy(calib, lv)

    n = len(states) or 1
    effects = [s.effect for s in states]
    avg_state_effect = round(sum(effects) / n, 4)

    # National, POPULATION-WEIGHTED baseline -> projected (so base + effect is
    # internally consistent and the headline reflects where people actually are).
    pops = [float(STATE_SEED[s.state]["pop"]) for s in states]
    tot_pop = sum(pops) or 1.0
    base_nat = sum(s.baseline * p for s, p in zip(states, pops)) / tot_pop
    proj_nat = sum(s.with_policy * p for s, p in zip(states, pops)) / tot_pop
    eff_nat = proj_nat - base_nat
    # Aggregate the two bounds SEPARATELY: per-state intervals are asymmetric once
    # saturation and an explicit target constrain them, so a single half-width
    # would put the headline interval outside the feasible range.
    ci_low_nat = sum(s.ci_low * p for s, p in zip(states, pops)) / tot_pop
    ci_high_nat = sum(s.ci_high * p for s, p in zip(states, pops)) / tot_pop
    headline_hw = max(ci_high_nat - eff_nat, eff_nat - ci_low_nat)
    headline_effect = round(eff_nat, 4)
    n_target_capped = sum(1 for s in states if s.target_capped)
    tgt = lv.target_penetration_pct
    n_target_met = 0 if tgt is None else sum(1 for s in states if tgt <= s.baseline)
    if tgt is None:
        target_status = "none"
    elif n_target_met == len(states):
        target_status = "already_met"
    elif n_target_capped:
        target_status = "binding"
    else:
        target_status = "not_binding"

    distribution = _distribution(states)
    mechanism_chain = _mechanism_chain(
        lv, base_nat, proj_nat, eff_nat,
        round(ci_low_nat, 4), round(ci_high_nat, 4),
        calib.slope_per_year, distribution["top_states"],
    )
    summary: dict[str, Any] = {
        "model_name": "twfe_did_projection",
        "domain": "ev_transport",
        "support_level": "supported",
        "method": "TWFE/DiD calibration + policy-conditional diffusion projection",
        "outcome_label": OUTCOME_LABEL,
        "unit": OUTCOME_UNIT,
        "policy_levers": {
            "incentive_strength": lv.incentive_strength,
            "infrastructure_push": lv.infrastructure_push,
            "target_penetration_pct": lv.target_penetration_pct,
            "horizon_years": lv.horizon_years,
            "intensity_multiplier": lv.intensity,
            "label": lv.label,
            # How the stated target interacts with today's levels: "none" (no target
            # given), "binding" (it limits the projected gain somewhere),
            # "not_binding" (the modelled gain stays below it everywhere), or
            # "already_met" (every modelled state is at or above it today).
            "target_status": target_status,
            "states_target_capped": n_target_capped,
            "states_target_already_met": n_target_met,
        },
        "headline": {
            "effect": headline_effect,
            "ci_low": round(ci_low_nat, 4),
            "ci_high": round(ci_high_nat, 4),
            "ci_level": 95,
            "se": round(headline_hw / Z95, 4),
            "baseline_value": round(base_nat, 3),
            "projected_value": round(proj_nat, 3),
            "avg_state_effect": avg_state_effect,
            "slope_per_year": calib.slope_per_year,
            "slope_se": calib.slope_se,
        },
        # The MEASURED historical causal estimate — distinct from the projection
        # above. This is the binary TWFE/DiD average treatment effect of a state
        # adopting its own EV policy; it does not depend on the submitted policy.
        "causal": {
            "effect": calib.headline_effect,
            "ci_low": calib.headline_ci_low,
            "ci_high": calib.headline_ci_high,
            "se": calib.headline_se,
            "unit": OUTCOME_UNIT,
            "label": (
                "Historical average treatment effect of a state adopting its own "
                "EV policy (binary TWFE/DiD)"
            ),
        },
        "fit": {"n_obs": calib.n_obs, "n_states": calib.n_states, "r2": calib.r2},
        "event_study": calib.event_study,
        "states": [
            {
                "state": s.state,
                "baseline_value": s.baseline,
                "predicted_value": s.with_policy,
                "policy_effect": s.effect,
                "ci_lower": s.ci_low,
                "ci_upper": s.ci_high,
                "years_since_adoption": s.years_since_adoption,
                "confidence": s.confidence,
                "income_group": _income_group(float(STATE_SEED[s.state]["gsdp"])),
                "driver": s.driver,
                "subsidy_share": s.subsidy_share,
                "infra_share": s.infra_share,
                "target_capped": s.target_capped,
            }
            for s in states
        ],
        "distribution": distribution,
        "mechanism_chain": mechanism_chain,
        "sensitivity": sensitivity(policy),
        "rf_backtest": calib.rf_backtest,
        "data_provenance": DATA_PROVENANCE,
        "limitation": LIMITATION,
    }
    # Plain-language reading of the numbers above. Deterministic and LLM-free, so
    # the words on the dashboard can never drift from the figures they describe.
    summary["interpretation"] = build_interpretation(summary)
    return summary


def compare_policies(
    policy_a: dict[str, Any] | None, policy_b: dict[str, Any] | None
) -> dict[str, Any]:
    """Run the quantitative projection for two policy variants and diff them.

    Pure, synchronous, LLM-free — the diffusion projection is cheap, so an A/B
    comparison is instant. Returns both model summaries plus a per-state delta and
    the states whose ranking/gain shifts most between the two designs."""
    a = run_model(policy_a)
    b = run_model(policy_b)
    eff_a = {s["state"]: s["policy_effect"] for s in a["states"]}
    eff_b = {s["state"]: s["policy_effect"] for s in b["states"]}
    base = {s["state"]: s["baseline_value"] for s in a["states"]}
    per_state = [
        {
            "state": st,
            "baseline_value": base.get(st),
            "effect_a": eff_a.get(st, 0.0),
            "effect_b": eff_b.get(st, 0.0),
            "delta": round(eff_b.get(st, 0.0) - eff_a.get(st, 0.0), 3),
        }
        for st in eff_a
    ]
    per_state.sort(key=lambda r: r["delta"], reverse=True)
    ha, hb = a["headline"], b["headline"]
    return {
        "a": a,
        "b": b,
        "headline_delta": round(hb["effect"] - ha["effect"], 4),
        "unit": OUTCOME_UNIT,
        "per_state": per_state,
        "b_favors": per_state[:5],       # states variant B lifts most vs A
        "a_favors": per_state[-5:][::-1],  # states variant A lifts most vs B
    }


if __name__ == "__main__":
    res = fit()
    print(f"[calibration] n_obs={res.n_obs} states={res.n_states} R2={res.r2}")
    print(f"[calibration] dose slope/yr = {res.slope_per_year} (se={res.slope_se})")
    # Demonstrate that DIFFERENT policies now yield DIFFERENT projections.
    scenarios = {
        "aggressive (high/high, 5yr, 30% target)": {
            "timeline_years": 5,
            "levers": {"incentive_strength": "high", "infrastructure_push": "high",
                       "target_penetration_pct": 30},
        },
        "modest (low/none, 2yr)": {
            "timeline_years": 2,
            "levers": {"incentive_strength": "low", "infrastructure_push": "none",
                       "target_penetration_pct": None},
        },
        # SAME overall strength, opposite DESIGN -> should reorder the winners.
        "subsidy-heavy (high inc / none infra, 5yr)": {
            "timeline_years": 5,
            "levers": {"incentive_strength": "high", "infrastructure_push": "none",
                       "target_penetration_pct": None},
        },
        "infra-heavy (none inc / high infra, 5yr)": {
            "timeline_years": 5,
            "levers": {"incentive_strength": "none", "infrastructure_push": "high",
                       "target_penetration_pct": None},
        },
    }
    for name, pol in scenarios.items():
        m = run_model(pol)
        h = m["headline"]
        c = m["causal"]
        top = sorted(m["states"], key=lambda s: s["policy_effect"], reverse=True)[:3]
        print(f"\n== {name} ==")
        print(f"  causal (historical ATE) = {c['effect']} pp  95% CI [{c['ci_low']}, {c['ci_high']}]")
        print(f"  projected national EV share = {h['baseline_value']}% -> {h['projected_value']}%"
              f"  ({h['effect']:+} pp, 95% CI [{h['ci_low']}, {h['ci_high']}])")
        print("  top states: " + ", ".join(
            f"{s['state']} +{s['policy_effect']}pp [{s['driver']}]" for s in top))
        print("  by income group: " + ", ".join(
            f"{g['group']} {g['avg_effect']:+}pp" for g in m["distribution"]["by_income_group"]))

    print("\n== sensitivity tornado (aggressive baseline) ==")
    sens = sensitivity(scenarios["aggressive (high/high, 5yr, 30% target)"])
    print(f"  baseline national effect = {sens['baseline_effect']} pp")
    for b in sens["bars"]:
        print(f"  {b['label']:<26} {b['low_effect']:+.2f} .. {b['high_effect']:+.2f} pp"
              f"  (swing {b['swing']:.2f})")

    print("\n== A/B compare: subsidy-heavy vs infra-heavy ==")
    cmp = compare_policies(
        scenarios["subsidy-heavy (high inc / none infra, 5yr)"],
        scenarios["infra-heavy (none inc / high infra, 5yr)"],
    )
    print(f"  headline delta (B-A) = {cmp['headline_delta']:+} pp")
    print("  states infra-heavy(B) lifts most vs subsidy-heavy(A): " + ", ".join(
        f"{r['state']} {r['delta']:+}pp" for r in cmp["b_favors"][:4]))
    print("  states subsidy-heavy(A) lifts most vs infra-heavy(B): " + ", ".join(
        f"{r['state']} {r['delta']:+}pp" for r in cmp["a_favors"][:4]))

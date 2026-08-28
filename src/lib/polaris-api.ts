import { getAdminKey } from "@/lib/admin";
import { getGroqKey } from "@/lib/groq-key";

export type RunStatus =
  | "pending"
  | "parsing"
  | "modeling"
  | "fetching_data"
  | "analyzing"
  | "debating"
  | "synthesizing"
  | "complete"
  | "error";

export type AgentStatus = "pending" | "running" | "done" | "error";

export type SupportLevel = "supported" | "partial" | "unsupported";

/** Policy-aware routing decision emitted by the backend domain registry. */
export type Classification = {
  domain_key: string;
  support_level: SupportLevel;
  model: string | null;
  label: string;
  rationale: string;
};

/** One state's counterfactual prediction from the quantitative model. */
export type StatePrediction = {
  state: string;
  baseline_value: number;
  predicted_value: number;
  policy_effect: number;
  ci_lower: number;
  ci_upper: number;
  confidence?: "high" | "medium" | "low" | string;
  income_group?: "higher" | "middle" | "lower" | string;
  /** Which transmission channel drives this state's projected gain. */
  driver?: "subsidy" | "infrastructure" | "mixed" | "measured" | string;
  subsidy_share?: number;
  infra_share?: number;
  /** True when a stated target — not the estimated response — set this state's gain. */
  target_capped?: boolean;
};

export type ModelHeadline = {
  effect: number;
  ci_low: number;
  ci_high: number;
  avg_state_effect: number;
  slope_per_year: number;
  baseline_value?: number;
  projected_value?: number;
  se?: number;
};

/** Measured historical causal estimate (binary TWFE/DiD ATE) — distinct from
 * the policy-conditional projection carried on `headline`. */
export type CausalEstimate = {
  effect: number;
  ci_low: number;
  ci_high: number;
  se?: number;
  unit?: string;
  label?: string;
};

/** One step of the Policy -> Mechanism -> Outcome -> Distribution chain. */
export type MechanismStep = { stage: string; title: string; detail: string };

/** Winners/losers + effect by income tier (all from real per-state effects). */
export type IncomeGroupEffect = {
  group: "higher" | "middle" | "lower" | string;
  label: string;
  n_states: number;
  avg_effect: number;
};
export type DistributionState = {
  state: string;
  policy_effect: number;
  baseline_value: number;
  predicted_value: number;
  income_group: string;
};
export type Distribution = {
  by_income_group: IncomeGroupEffect[];
  top_states: DistributionState[];
  bottom_states: DistributionState[];
};

export type EventStudyPoint = {
  period: number;
  coefficient: number;
  ci_low?: number;
  ci_high?: number;
};

/** One-at-a-time lever perturbation of the national headline effect. */
export type SensitivityBar = {
  lever: string;
  label: string;
  low_setting: string;
  high_setting: string;
  low_effect: number;
  high_effect: number;
  swing: number;
};
export type Sensitivity = {
  baseline_effect: number;
  baseline_label: string;
  unit: string;
  bars: SensitivityBar[];
};

/** Policy levers extracted by the parser; drive the quantitative projection. */
export type PolicyLevers = {
  incentive_strength: "none" | "low" | "medium" | "high";
  infrastructure_push: "none" | "low" | "medium" | "high";
  target_penetration_pct: number | null;
  horizon_years?: number;
  intensity_multiplier?: number;
  label?: string;
  /** How a stated target interacts with today's levels. */
  target_status?: "none" | "binding" | "not_binding" | "already_met" | string;
  states_target_capped?: number;
  states_target_already_met?: number;
};

/** Deterministic plain-language reading of the model numbers, computed backend-side
 * (no LLM), so the words can never disagree with the charts. */
export type InterpretationRead = { label: string; text: string };
export type InterpretationUncertainty = {
  label: "tight" | "moderate" | "wide" | "pinned" | string;
  half_width: number;
  relative_width: number;
  includes_no_change: boolean;
  text: string;
};
export type Interpretation = {
  one_liner: string;
  relative_change_pct: number;
  per_year_effect: number;
  reads: InterpretationRead[];
  uncertainty: InterpretationUncertainty;
  confidence_mix: { high: number; medium: number; low: number };
  caveats: string[];
  glossary: { term: string; definition: string }[];
};

/** User-supplied corrections to the parsed levers, sent on a "re-run". */
export type LeverOverrides = {
  incentive_strength?: "none" | "low" | "medium" | "high";
  infrastructure_push?: "none" | "low" | "medium" | "high";
  target_penetration_pct?: number | null;
  horizon_years?: number | null;
};

/** Full quantitative-model summary (present only for supported domains). */
export type ModelSummary = {
  model_name: string;
  domain?: string;
  support_level: SupportLevel;
  method?: string;
  outcome_label?: string;
  unit?: string;
  headline: ModelHeadline;
  causal?: CausalEstimate;
  policy_levers?: PolicyLevers;
  fit?: { n_obs: number; n_states: number; r2: number };
  states: StatePrediction[];
  distribution?: Distribution;
  mechanism_chain?: MechanismStep[];
  sensitivity?: Sensitivity;
  event_study?: EventStudyPoint[];
  interpretation?: Interpretation;
  data_provenance?: string;
  limitation?: string;
};

export type MetricEffect = {
  metric: string;
  direction: "up" | "down" | "flat";
  magnitude: "small" | "moderate" | "large";
  confidence: number;
};

export type DomainAgentOutput = {
  metric_effects: MetricEffect[];
  reasoning: string;
  affected_states_weight: Record<string, number>;
};

export type RiskAgentOutput = {
  risk_level: "Low" | "Medium" | "High";
  justification: string;
  confidence: number;
};

/** One retrieved source shown in the Evidence panel. */
export type EvidenceSeriesPoint = { year: string | null; value: number | null; indicator?: string };
export type EvidenceSource = {
  kind: string;
  key: string;
  title: string;
  provider: string;
  code: string | null;
  url: string | null;
  latest: { year: string | null; value: number | null } | null;
  series: EvidenceSeriesPoint[];
  relevance?: string | null;
  error?: string | null;
};
export type EvidencePolicyContext = {
  domain?: string | null;
  goals?: string[];
  affected_sectors?: string[];
  timeline_years?: number | null;
  incentive_strength?: string | null;
  infrastructure_push?: string | null;
  target_penetration_pct?: number | null;
  levers_overridden?: boolean;
};
export type EvidenceModelHighlights = {
  effect?: number | null;
  baseline_value?: number | null;
  projected_value?: number | null;
  ci_low?: number | null;
  ci_high?: number | null;
  top_states?: { state: string; policy_effect: number }[];
};
export type Evidence = {
  policy_context?: EvidencePolicyContext | null;
  sources: EvidenceSource[];
  state_seed: { title: string; provider: string; n_states: number; fields: string[] };
  model: {
    title?: string;
    provider: string;
    provenance?: string | null;
    limitation?: string | null;
    outcome_label?: string | null;
    fit?: { n_obs: number; n_states: number; r2: number } | null;
    highlights?: EvidenceModelHighlights | null;
  } | null;
};

/** Debate room — conditionally instantiated on conflict / wide uncertainty. */
export type DebateTurn = { speaker: "Proponent" | "Skeptic" | "Moderator"; argument: string };
export type DebateRound = { round: number; turns: DebateTurn[] };
export type DebateResolution = {
  conclusion: string;
  leaning: "proponent" | "skeptic" | "indeterminate";
  adjusted_confidence: number;
};
export type Debate = {
  triggered: boolean;
  trigger_reason: string;
  disputed_topic: string | null;
  rounds?: DebateRound[];
  resolution?: DebateResolution | null;
  error?: string | null;
};

export type Run = {
  run_id: string;
  status: RunStatus;
  policy_input: { policy_text: string; domain_hint: string | null; lever_overrides?: LeverOverrides | null };
  parsed_policy: {
    domain: string;
    goals: string[];
    stakeholders: string[];
    affected_sectors: string[];
    timeline_years: number;
    levers?: PolicyLevers;
    levers_overridden?: boolean;
  } | null;
  agents: {
    economic: { status: AgentStatus; output: DomainAgentOutput | null };
    environment: { status: AgentStatus; output: DomainAgentOutput | null };
    social: { status: AgentStatus; output: DomainAgentOutput | null };
    risk: { status: AgentStatus; output: RiskAgentOutput | null };
  };
  synthesis: {
    overall_impact_score: number;
    verdict: string;
    top_3_effects: string[];
    risk_level: "Low" | "Medium" | "High";
    confidence: number;
  } | null;
  classification: Classification | null;
  model_summary: ModelSummary | null;
  model_predictions: StatePrediction[] | null;
  state_impact: Record<string, number> | null;
  state_impact_source: "quantitative_model" | "llm_estimate" | null;
  evidence: Evidence | null;
  debate: Debate | null;
  error: string | null;
};

export const API_BASE_URL: string =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "http://localhost:8000";

/** Thrown when the backend can't be reached at all (down, CORS, timeout). */
export class NetworkUnreachableError extends Error {
  constructor(message = "Can't reach the analysis server") {
    super(message);
    this.name = "NetworkUnreachableError";
  }
}

/** Thrown when the backend rejects a request. Carries the status and the
 * human-readable `detail` FastAPI sends, so gates (401) and rate limits (429)
 * can be shown to the user verbatim instead of as a generic failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string | null;
  constructor(status: number, detail: string | null) {
    super(detail || `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new NetworkUnreachableError();
  }
  if (!response.ok) {
    let detail: string | null = null;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      detail = null;
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

/** Attach the owner key header when one is stored on this device. */
function adminHeaders(): Record<string, string> {
  const key = getAdminKey();
  return key ? { "x-admin-key": key } : {};
}

/** Attach the user's own Groq key when one is stored, so runs use their quota. */
function groqHeaders(): Record<string, string> {
  const key = getGroqKey();
  return key ? { "x-groq-key": key } : {};
}

export function createRun(input: {
  policy_text: string;
  domain_hint: string | null;
  lever_overrides?: LeverOverrides | null;
}) {
  return request<{ run_id: string }>("/api/runs", {
    method: "POST",
    // The owner key exempts the owner from the per-IP run cap; the Groq key makes
    // the run bill to the user's own quota.
    headers: { ...groqHeaders(), ...adminHeaders() },
    body: JSON.stringify(input),
  });
}

export function getRun(runId: string) {
  return request<Run>(`/api/runs/${runId}`);
}

/** Compact summary of a past run, for the Reports history list. */
export type RunSummary = {
  run_id: string;
  status: RunStatus;
  policy_text: string;
  domain: string | null;
  verdict: string | null;
  overall_impact_score: number | null;
  risk_level: "Low" | "Medium" | "High" | null;
  confidence: number | null;
  created_at: string;
  updated_at: string;
};

export function listRuns(limit = 50) {
  return request<RunSummary[]>(`/api/runs?limit=${limit}`, { headers: adminHeaders() });
}

/** Delete a single run from the history (owner only). */
export function deleteRun(runId: string) {
  return request<{ deleted: string }>(`/api/runs/${runId}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

/** Clear the entire run history (owner only). */
export function deleteAllRuns() {
  return request<{ deleted_count: number }>(`/api/runs`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

/** Whether the backend has an owner gate configured, and whether `key` unlocks it. */
export type AdminStatus = {
  configured: boolean;
  ok: boolean;
  /** True when the backend refuses to start a run without the user's own Groq key. */
  requires_key_for_runs?: boolean;
};

export async function checkAdmin(key?: string): Promise<AdminStatus> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const candidate = key ?? getAdminKey();
  if (candidate) headers["x-admin-key"] = candidate;
  try {
    const res = await fetch(`${API_BASE_URL}/api/admin/check`, { headers });
    if (!res.ok) return { configured: true, ok: false };
    return (await res.json()) as AdminStatus;
  } catch {
    // Backend unreachable — treat as no gate so local dev isn't blocked.
    return { configured: false, ok: false };
  }
}

/** Result of a live connectivity probe against the backend. */
export type HealthResult = { ok: boolean; latencyMs: number };

/** Ping /api/health and measure round-trip latency. Never throws. */
export async function checkHealth(): Promise<HealthResult> {
  const started =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, {
      headers: { "content-type": "application/json" },
    });
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    return { ok: res.ok, latencyMs: Math.round(now - started) };
  } catch {
    return { ok: false, latencyMs: 0 };
  }
}

/** One side of an A/B quantitative comparison. */
export type CompareVariant = {
  label?: string;
  incentive_strength?: "none" | "low" | "medium" | "high";
  infrastructure_push?: "none" | "low" | "medium" | "high";
  target_penetration_pct?: number | null;
  horizon_years?: number | null;
};

export type CompareStateDelta = {
  state: string;
  baseline_value: number | null;
  effect_a: number;
  effect_b: number;
  delta: number;
};

/** Result of POST /api/model/compare — two full projections plus their diff. */
export type CompareResult = {
  a: ModelSummary;
  b: ModelSummary;
  labels: { a: string; b: string };
  headline_delta: number;
  unit: string;
  per_state: CompareStateDelta[];
  b_favors: CompareStateDelta[];
  a_favors: CompareStateDelta[];
};

export function compareModel(input: { a: CompareVariant; b: CompareVariant }) {
  return request<CompareResult>("/api/model/compare", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export const STATUS_LABELS: Record<RunStatus, string> = {
  pending: "Queued…",
  parsing: "Parsing policy…",
  modeling: "Running model…",
  fetching_data: "Fetching data…",
  analyzing: "Analyzing…",
  debating: "Debating…",
  synthesizing: "Synthesizing…",
  complete: "Complete",
  error: "Error",
};

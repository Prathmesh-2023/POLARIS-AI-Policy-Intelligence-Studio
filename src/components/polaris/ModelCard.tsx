import { ArrowRight, FlaskConical, Info } from "lucide-react";

import type { Classification, EventStudyPoint, ModelSummary } from "@/lib/polaris-api";

function fmtPP(value: number, withSign = true): string {
  const rounded = Math.abs(value) < 0.005 ? 0 : value;
  const sign = withSign && rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(2)}`;
}

/** Compact event-study sparkline: relative-year coefficients around adoption. */
function EventStudy({ points }: { points: EventStudyPoint[] }) {
  if (!points.length) return null;
  const w = 240;
  const h = 64;
  const pad = 6;
  const xs = points.map((p) => p.period);
  const ys = points.map((p) => p.coefficient);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const px = (x: number) => pad + ((x - minX) / spanX) * (w - 2 * pad);
  const py = (y: number) => h - pad - ((y - minY) / spanY) * (h - 2 * pad);
  const zeroY = py(0);
  const zeroX = px(0);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.period).toFixed(1)},${py(p.coefficient).toFixed(1)}`)
    .join("");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
      <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="var(--border)" strokeWidth="1" />
      <line x1={zeroX} y1={pad} x2={zeroX} y2={h - pad} stroke="var(--border)" strokeDasharray="3 3" strokeWidth="1" />
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.period} cx={px(p.period)} cy={py(p.coefficient)} r="2.5" fill="var(--primary)" />
      ))}
    </svg>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="label-eyebrow">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
      {label}
    </span>
  );
}

export function ModelCard({
  model,
  classification,
}: {
  model: ModelSummary | null;
  classification: Classification | null;
}) {
  // No quantitative model summary yet.
  if (!model) {
    const pending = classification?.support_level === "supported";
    return (
      <div className="panel">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <div className="label-eyebrow">Analysis method</div>
        </div>
        <h2 className="mt-2 text-lg font-semibold">
          {pending ? "Fitting quantitative model…" : "Qualitative assessment"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {pending
            ? "This domain has a calibrated panel model. Estimating state-level effects — results will appear here shortly."
            : (classification?.rationale ??
              "This policy falls outside the domains with a calibrated quantitative model, so the estimate below is reasoned by the analysis engine rather than derived from a fitted panel regression. No state-level numbers are invented.")}
        </p>
      </div>
    );
  }

  const h = model.headline;

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <div className="label-eyebrow">Quantitative model</div>
            <h2 className="mt-1 text-lg font-semibold leading-snug">
              {model.method ?? model.model_name}
            </h2>
            {model.outcome_label && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Outcome: {model.outcome_label}
                {model.fit ? ` · R² ${model.fit.r2.toFixed(2)} · n=${model.fit.n_obs}` : ""}
              </p>
            )}
          </div>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
          Model-backed estimate
        </span>
      </div>

      {model.policy_levers && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="label-eyebrow">Projected for this policy</span>
          <Chip label={`${model.policy_levers.incentive_strength} incentives`} />
          <Chip label={`${model.policy_levers.infrastructure_push} infrastructure`} />
          {model.policy_levers.horizon_years != null && (
            <Chip label={`${model.policy_levers.horizon_years}-yr horizon`} />
          )}
          {model.policy_levers.target_penetration_pct != null && (
            <Chip label={`${model.policy_levers.target_penetration_pct}% target`} />
          )}
        </div>
      )}

      {/* Scenario projection: baseline -> projected with an explicit range. */}
      {h.baseline_value != null && h.projected_value != null && (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="label-eyebrow text-primary">Projected outcome (scenario for your policy)</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm text-muted-foreground">
              National {(model.outcome_label ?? "outcome").toLowerCase()}
            </span>
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {h.baseline_value.toFixed(1)}%
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-2xl font-semibold tabular-nums text-primary">
              {h.projected_value.toFixed(1)}%
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
              {fmtPP(h.effect)} pp
            </span>
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground">
            Likely range {fmtPP(h.ci_low)} to {fmtPP(h.ci_high)} pp (95%) · avg. state effect{" "}
            {fmtPP(h.avg_state_effect)} pp
          </div>
        </div>
      )}

      {/* Historical causal estimate — measured, policy-independent. */}
      {model.causal && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center gap-1.5">
            <div className="label-eyebrow">Historical causal estimate</div>
            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              measured
            </span>
          </div>
          <div className="mt-2 grid gap-5 sm:grid-cols-2">
            <Stat
              label="Avg. treatment effect"
              value={`${fmtPP(model.causal.effect)} pp`}
              sub={`95% CI ${fmtPP(model.causal.ci_low)} to ${fmtPP(model.causal.ci_high)}`}
            />
            <Stat
              label="Dose slope"
              value={`${fmtPP(h.slope_per_year)} pp/yr`}
              sub="per year of policy exposure"
            />
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {model.causal.label}. Estimated from the historical panel — it does not change with
            your policy. The projection above scales this forward for the levers you set, so a
            simulated scenario is never presented as a measured causal number.
          </p>
        </div>
      )}

      {model.event_study && model.event_study.length > 1 && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div className="label-eyebrow">Event study</div>
            <span className="text-[11px] text-muted-foreground">effect vs. years around adoption</span>
          </div>
          <div className="mt-2">
            <EventStudy points={model.event_study} />
          </div>
        </div>
      )}

      {(model.data_provenance || model.limitation) && (
        <div className="mt-5 space-y-1 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          {model.data_provenance && (
            <p>
              <span className="font-medium text-foreground">Data:</span> {model.data_provenance}
            </p>
          )}
          {model.limitation && (
            <p>
              <span className="font-medium text-foreground">Limitation:</span> {model.limitation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

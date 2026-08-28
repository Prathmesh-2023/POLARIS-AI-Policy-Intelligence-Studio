import { Database, ExternalLink, FlaskConical, Layers, Sparkles, Target } from "lucide-react";

import type { Evidence, EvidencePolicyContext, EvidenceSource } from "@/lib/polaris-api";

function fmtPP(v: number | null | undefined): string {
  if (v == null) return "–";
  const r = Math.abs(v) < 0.005 ? 0 : v;
  return `${r > 0 ? "+" : ""}${r.toFixed(2)}`;
}

function PolicyContext({ ctx }: { ctx: EvidencePolicyContext }) {
  const chips: string[] = [];
  if (ctx.incentive_strength) chips.push(`${ctx.incentive_strength} incentives`);
  if (ctx.infrastructure_push) chips.push(`${ctx.infrastructure_push} infrastructure`);
  if (ctx.target_penetration_pct != null) chips.push(`${ctx.target_penetration_pct}% target`);
  if (ctx.timeline_years != null) chips.push(`${ctx.timeline_years}-yr horizon`);
  const goals = ctx.goals ?? [];
  const sectors = ctx.affected_sectors ?? [];

  return (
    <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <span className="label-eyebrow text-primary">Grounded in your policy</span>
        {ctx.levers_overridden && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            adjusted by you
          </span>
        )}
      </div>
      {goals.length > 0 && (
        <p className="mt-2 text-sm text-foreground">
          <span className="text-muted-foreground">Goals: </span>
          {goals.join("; ")}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span
            key={c}
            className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground"
          >
            {c}
          </span>
        ))}
        {sectors.map((s) => (
          <span
            key={s}
            className="rounded-full border border-border/70 px-2.5 py-0.5 text-[11px] text-muted-foreground"
          >
            {s}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        The macro indicators below are read against this specific reading of your policy — its
        levers, sectors and horizon — not a generic template.
      </p>
    </div>
  );
}

function Sparkline({ source }: { source: EvidenceSource }) {
  const pts = [...source.series]
    .reverse()
    .filter((p) => p.value !== null) as { year: string | null; value: number }[];
  if (pts.length < 2) return null;
  const w = 96;
  const h = 28;
  const ys = pts.map((p) => p.value);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((p.value - lo) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24 shrink-0" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SourceRow({ source }: { source: EvidenceSource }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/70 bg-secondary/40 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{source.title}</span>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground transition-colors hover:text-primary"
              aria-label={`Open ${source.title}`}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{source.provider}</span>
          {source.code && <span className="font-mono opacity-70">· {source.code}</span>}
        </div>
        {source.relevance && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground/80">Why it&apos;s here: </span>
            {source.relevance}
          </p>
        )}
      </div>
      {source.error ? (
        <span className="shrink-0 text-xs text-warning">unavailable</span>
      ) : source.latest && source.latest.value !== null ? (
        <div className="flex items-center gap-3">
          <Sparkline source={source} />
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums text-foreground">
              {typeof source.latest.value === "number"
                ? source.latest.value.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : source.latest.value}
            </div>
            <div className="text-[11px] text-muted-foreground">{source.latest.year}</div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function EvidencePanel({ evidence }: { evidence: Evidence | null }) {
  if (!evidence) return null;
  const { sources, state_seed, model, policy_context } = evidence;
  const hi = model?.highlights;

  return (
    <div className="panel">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" />
        <div className="label-eyebrow">Retrieved sources</div>
      </div>
      <h2 className="mt-1 text-lg font-semibold">Evidence behind this analysis</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Every headline number is grounded in the sources below — the reasoning engine interprets
        this evidence rather than inventing figures.
      </p>

      {policy_context && <PolicyContext ctx={policy_context} />}

      {sources.length > 0 && (
        <div className="mt-5">
          <div className="label-eyebrow flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Macro indicators
          </div>
          <ul className="mt-2 space-y-2">
            {sources.map((s) => (
              <SourceRow key={s.key} source={s} />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-secondary/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{state_seed.title}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {state_seed.provider} · {state_seed.n_states} states ·{" "}
            {state_seed.fields.join(", ")}
          </div>
        </div>

        {model && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{model.title}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {model.provider}
              {model.fit ? ` · R² ${model.fit.r2.toFixed(2)} · n=${model.fit.n_obs}` : ""}
            </div>
            {hi && hi.projected_value != null && hi.baseline_value != null && (
              <p className="mt-2 text-xs leading-relaxed text-foreground">
                Projected {(model.outcome_label ?? "outcome").toLowerCase()}{" "}
                {hi.baseline_value.toFixed(1)}% → {hi.projected_value.toFixed(1)}% ({fmtPP(hi.effect)}{" "}
                pp)
                {hi.top_states && hi.top_states.length > 0 && (
                  <>
                    {" "}
                    · leads in{" "}
                    {hi.top_states.map((s) => s.state).join(", ")}
                  </>
                )}
                .
              </p>
            )}
            {model.provenance && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {model.provenance}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

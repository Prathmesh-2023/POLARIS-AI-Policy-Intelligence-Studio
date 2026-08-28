import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Leaf,
  Loader2,
  Minus,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";

import type { AgentStatus, MetricEffect, Run } from "@/lib/polaris-api";

const DIM_META = {
  economic: { label: "Economic", icon: TrendingUp, blurb: "Growth, jobs, investment, fiscal load" },
  environment: { label: "Environment", icon: Leaf, blurb: "Emissions, energy, resource use" },
  social: { label: "Social", icon: Users, blurb: "Equity, access, public welfare" },
} as const;

function StatusPill({ status }: { status: AgentStatus }) {
  const map = {
    running: { icon: Loader2, cls: "text-primary", spin: true, text: "running" },
    done: { icon: CheckCircle2, cls: "text-success", spin: false, text: "done" },
    error: { icon: Circle, cls: "text-danger", spin: false, text: "error" },
    pending: { icon: Circle, cls: "text-muted-foreground/50", spin: false, text: "pending" },
  }[status];
  const Icon = map.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider ${map.cls}`}>
      <Icon className={`h-3.5 w-3.5 ${map.spin ? "animate-spin" : ""}`} />
      {map.text}
    </span>
  );
}

function DirectionIcon({ direction }: { direction: MetricEffect["direction"] }) {
  if (direction === "up") return <ArrowUpRight className="h-4 w-4 text-success" />;
  if (direction === "down") return <ArrowDownRight className="h-4 w-4 text-danger" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

const MAG_DOTS = { small: 1, moderate: 2, large: 3 } as const;

function EffectRow({ effect }: { effect: MetricEffect }) {
  const dots = MAG_DOTS[effect.magnitude] ?? 2;
  return (
    <div className="flex items-center gap-3 py-2">
      <DirectionIcon direction={effect.direction} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{effect.metric}</span>
      <span className="flex items-center gap-0.5" title={`magnitude: ${effect.magnitude}`}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i < dots ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </span>
      <div className="flex w-24 items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round(effect.confidence * 100)}%` }}
          />
        </div>
        <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
          {Math.round(effect.confidence * 100)}%
        </span>
      </div>
    </div>
  );
}

function TopStates({ weights }: { weights: Record<string, number> }) {
  const top = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (top.length === 0) return null;
  const max = top[0]?.[1] || 1;
  return (
    <div className="mt-4">
      <div className="label-eyebrow">Most affected states</div>
      <div className="mt-2 space-y-1.5">
        {top.map(([state, w]) => (
          <div key={state} className="flex items-center gap-2">
            <span className="w-32 truncate text-xs text-muted-foreground">{state}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${Math.round((w / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DimensionCard({
  dim,
  agent,
}: {
  dim: keyof typeof DIM_META;
  agent: { status: AgentStatus; output: Run["agents"]["economic"]["output"] };
}) {
  const meta = DIM_META[dim];
  const Icon = meta.icon;
  const out = agent.output;
  return (
    <div className="panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div>
            <h3 className="text-base font-semibold leading-tight">{meta.label}</h3>
            <p className="text-xs text-muted-foreground">{meta.blurb}</p>
          </div>
        </div>
        <StatusPill status={agent.status} />
      </div>

      {out?.reasoning && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{out.reasoning}</p>
      )}

      {out && out.metric_effects.length > 0 && (
        <div className="mt-4 border-t border-border pt-2">
          <div className="flex items-center justify-between pb-1">
            <div className="label-eyebrow">Metric effects</div>
            <div className="label-eyebrow">Confidence</div>
          </div>
          <div className="divide-y divide-border/60">
            {out.metric_effects.map((e, i) => (
              <EffectRow key={`${e.metric}-${i}`} effect={e} />
            ))}
          </div>
        </div>
      )}

      {out && <TopStates weights={out.affected_states_weight} />}

      {agent.status === "pending" && (
        <p className="mt-4 text-sm text-muted-foreground">Waiting to run…</p>
      )}
    </div>
  );
}

function RiskCard({ agent }: { agent: Run["agents"]["risk"] }) {
  const out = agent.output;
  const level = out?.risk_level ?? "Medium";
  const tint =
    level === "High"
      ? "text-danger border-danger/30 bg-danger/10"
      : level === "Low"
        ? "text-success border-success/30 bg-success/10"
        : "text-warning border-warning/30 bg-warning/10";
  return (
    <div className="panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldAlert className="h-4.5 w-4.5" />
          </span>
          <div>
            <h3 className="text-base font-semibold leading-tight">Risk</h3>
            <p className="text-xs text-muted-foreground">Feasibility, conflict, model uncertainty</p>
          </div>
        </div>
        <StatusPill status={agent.status} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${tint}`}>
          {level} risk
        </span>
        {out && (
          <span className="text-xs text-muted-foreground">
            confidence {Math.round(out.confidence * 100)}%
          </span>
        )}
      </div>

      {out?.justification && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{out.justification}</p>
      )}
    </div>
  );
}

export function AgentsView({ agents }: { agents: Run["agents"] }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="label-eyebrow">Multi-agent analysis</div>
        <h2 className="mt-1 text-xl font-semibold">Four specialists, one policy</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Economic, environmental and social effects are reasoned in a single grounded pass; a
          separate risk agent weighs feasibility and uncertainty. Bars show each effect's
          confidence; dots show its magnitude.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DimensionCard dim="economic" agent={agents.economic} />
        <DimensionCard dim="environment" agent={agents.environment} />
        <DimensionCard dim="social" agent={agents.social} />
        <RiskCard agent={agents.risk} />
      </div>
    </div>
  );
}

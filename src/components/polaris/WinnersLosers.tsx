import { TrendingDown, TrendingUp, Users } from "lucide-react";

import type { Distribution, DistributionState } from "@/lib/polaris-api";

function fmtPP(v: number): string {
  const r = Math.abs(v) < 0.005 ? 0 : v;
  return `${r > 0 ? "+" : ""}${r.toFixed(2)}`;
}

function StateBar({ s, max }: { s: DistributionState; max: number }) {
  const pct = max > 0 ? Math.max(2, (s.policy_effect / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 truncate text-sm text-foreground" title={s.state}>
        {s.state}
      </div>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
        {fmtPP(s.policy_effect)}
      </div>
    </div>
  );
}

const GROUP_ORDER: Record<string, number> = { higher: 0, middle: 1, lower: 2 };

export function WinnersLosers({
  distribution,
  outcomeLabel,
}: {
  distribution: Distribution | null;
  outcomeLabel?: string | undefined;
}) {
  if (!distribution || !distribution.top_states.length) return null;

  const top = distribution.top_states;
  const bottom = distribution.bottom_states;
  const maxEffect = Math.max(...top.map((s) => s.policy_effect), 0.0001);

  const groups = [...distribution.by_income_group].sort(
    (a, b) => (GROUP_ORDER[a.group] ?? 9) - (GROUP_ORDER[b.group] ?? 9),
  );
  const maxGroup = Math.max(...groups.map((g) => Math.abs(g.avg_effect)), 0.0001);

  return (
    <div className="panel">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <div>
          <div className="label-eyebrow">Distributional impact</div>
          <h2 className="mt-1 text-lg font-semibold leading-snug">
            Where the projected gains land across states
          </h2>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Projected {(outcomeLabel ?? "outcome").toLowerCase()} gain (pp) per state and by income
        tier — derived from the model&apos;s per-state effects and each state&apos;s published
        GSDP-per-capita index. No figures are invented.
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <TrendingUp className="h-4 w-4 text-success" /> Largest projected gains
          </div>
          <div className="space-y-2">
            {top.map((s) => (
              <StateBar key={s.state} s={s} max={maxEffect} />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <TrendingDown className="h-4 w-4 text-muted-foreground" /> Smallest projected gains
          </div>
          <div className="space-y-2">
            {bottom.map((s) => (
              <StateBar key={s.state} s={s} max={maxEffect} />
            ))}
          </div>
        </div>
      </div>

      {groups.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="label-eyebrow">By income tier</div>
          <div className="mt-3 space-y-2.5">
            {groups.map((g) => {
              const pct = Math.max(2, (Math.abs(g.avg_effect) / maxGroup) * 100);
              return (
                <div key={g.group} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 text-sm text-foreground">
                    {g.label}
                    <span className="ml-1 text-xs text-muted-foreground">({g.n_states})</span>
                  </div>
                  <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                    {fmtPP(g.avg_effect)}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            A wide gap between tiers flags a distributional concern: gains that concentrate in
            higher-income states suggest a subsidy targeted at lower-income states would spread
            the benefit more evenly.
          </p>
        </div>
      )}
    </div>
  );
}

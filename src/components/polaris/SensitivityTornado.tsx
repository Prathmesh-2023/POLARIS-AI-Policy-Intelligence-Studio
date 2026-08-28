import { Activity } from "lucide-react";

import type { Sensitivity } from "@/lib/polaris-api";

function fmtPP(v: number): string {
  const r = Math.abs(v) < 0.005 ? 0 : v;
  return `${r > 0 ? "+" : ""}${r.toFixed(2)}`;
}

/**
 * One-at-a-time sensitivity "tornado". For each policy lever we swing it from its
 * low to its high setting (holding the others at the submitted policy) and chart
 * the resulting national headline effect. The longest bar is the lever the
 * headline is most sensitive to. Pure model re-evaluation — nothing fabricated.
 */
export function SensitivityTornado({ sensitivity }: { sensitivity: Sensitivity | null }) {
  if (!sensitivity || sensitivity.bars.length === 0) return null;
  const { bars, baseline_effect } = sensitivity;

  const lo = Math.min(baseline_effect, ...bars.map((b) => b.low_effect));
  const hi = Math.max(baseline_effect, ...bars.map((b) => b.high_effect));
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const basePct = pct(baseline_effect);

  return (
    <div className="panel">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <div className="label-eyebrow">Sensitivity analysis</div>
      </div>
      <h2 className="mt-1 text-lg font-semibold">Which lever moves the outcome most</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Each bar swings one lever from its lowest to highest setting while the rest of your policy
        stays fixed. The dashed line is your current projection ({fmtPP(baseline_effect)} pp).
      </p>

      <div className="mt-5 space-y-5">
        {bars.map((b) => {
          const left = Math.min(pct(b.low_effect), pct(b.high_effect));
          const width = Math.max(1.5, Math.abs(pct(b.high_effect) - pct(b.low_effect)));
          return (
            <div key={b.lever}>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium text-foreground">{b.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  swing <span className="font-semibold text-foreground">{b.swing.toFixed(2)} pp</span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                {/* low end — value + setting, fixed gutter */}
                <div className="w-16 shrink-0 text-right">
                  <div className="text-xs font-medium tabular-nums text-muted-foreground">
                    {fmtPP(b.low_effect)}
                  </div>
                  <div className="text-[10px] capitalize text-muted-foreground/70">
                    {b.low_setting}
                  </div>
                </div>
                {/* the shared-domain track */}
                <div className="relative h-7 flex-1 rounded-md bg-secondary/60">
                  {/* baseline marker (your current projection) */}
                  <div
                    className="absolute top-0 bottom-0 border-l border-dashed border-foreground/50"
                    style={{ left: `${basePct}%` }}
                    aria-hidden
                  />
                  {/* the swing bar */}
                  <div
                    className="absolute top-1 bottom-1 rounded bg-primary/70"
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                </div>
                {/* high end — value + setting, fixed gutter */}
                <div className="w-16 shrink-0 text-left">
                  <div className="text-xs font-semibold tabular-nums text-foreground">
                    {fmtPP(b.high_effect)}
                  </div>
                  <div className="text-[10px] capitalize text-muted-foreground/70">
                    {b.high_setting}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Bars are ranked by swing — the top lever is where design choices change the projected
        national EV-share effect the most.
      </p>
    </div>
  );
}

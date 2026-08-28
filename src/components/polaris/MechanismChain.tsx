import { GitBranch } from "lucide-react";

import type { MechanismStep } from "@/lib/polaris-api";

const STAGE_STYLE: Record<string, { dot: string; text: string }> = {
  Policy: { dot: "bg-primary", text: "text-primary" },
  Mechanism: { dot: "bg-warning", text: "text-warning" },
  Outcome: { dot: "bg-success", text: "text-success" },
  Distribution: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
};
const FALLBACK_STYLE = { dot: "bg-muted-foreground", text: "text-muted-foreground" };

export function MechanismChain({ steps }: { steps: MechanismStep[] | null }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="panel">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-primary" />
        <div>
          <div className="label-eyebrow">Reasoning chain</div>
          <h2 className="mt-1 text-lg font-semibold leading-snug">
            Policy → mechanism → outcome
          </h2>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        How the projection gets from the levers you set to a state-level effect. Every clause
        references a real lever or a computed model number.
      </p>

      <ol className="mt-5 space-y-0">
        {steps.map((step, i) => {
          const style = STAGE_STYLE[step.stage] ?? FALLBACK_STYLE;
          const last = i === steps.length - 1;
          return (
            <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
              {!last && (
                <span
                  className="absolute left-[7px] top-4 h-full w-px bg-border"
                  aria-hidden="true"
                />
              )}
              <span
                className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-4 ring-card ${style.dot}`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className={`label-eyebrow ${style.text}`}>{step.stage}</div>
                <div className="mt-0.5 text-sm font-semibold text-foreground">{step.title}</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

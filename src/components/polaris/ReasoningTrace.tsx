import { Check, Loader2 } from "lucide-react";

import type { RunStatus } from "@/lib/polaris-api";

/** The agentic pipeline, in order. Each step maps to the backend RunStatus that
 * is active while that step runs. */
const STEPS: { key: RunStatus; label: string; detail: string }[] = [
  { key: "parsing", label: "Parse policy", detail: "Extract goals, sectors & levers" },
  { key: "modeling", label: "Classify & model", detail: "Route domain, fit panel regression" },
  { key: "fetching_data", label: "Retrieve evidence", detail: "World Bank + state anchors" },
  { key: "analyzing", label: "Multi-agent analysis", detail: "Economic · environment · social · risk" },
  { key: "debating", label: "Debate room", detail: "Adversarial review on conflict" },
  { key: "synthesizing", label: "Synthesize verdict", detail: "Weigh evidence into a ruling" },
];

const ORDER: RunStatus[] = [
  "pending",
  "parsing",
  "modeling",
  "fetching_data",
  "analyzing",
  "debating",
  "synthesizing",
  "complete",
];

function rank(status: RunStatus): number {
  const i = ORDER.indexOf(status);
  return i === -1 ? 0 : i;
}

/**
 * Live reasoning trace — makes the agentic pipeline legible as it runs. Reads the
 * run's status and lights up each stage in sequence (done → active → pending).
 */
export function ReasoningTrace({ status }: { status: RunStatus | undefined }) {
  if (!status || status === "error") return null;
  const done = status === "complete";
  const current = rank(status);

  return (
    <div className="panel">
      <div className="flex items-center justify-between">
        <div className="label-eyebrow">Reasoning trace</div>
        <span className="text-[11px] text-muted-foreground">
          {done ? "Pipeline complete" : "Analysis in progress…"}
        </span>
      </div>

      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step) => {
          const r = rank(step.key);
          const state = done || r < current ? "done" : r === current ? "active" : "pending";
          return (
            <li
              key={step.key}
              className={
                state === "active"
                  ? "flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5"
                  : "flex items-start gap-3 rounded-xl border border-border/70 px-3 py-2.5"
              }
            >
              <span
                className={
                  state === "done"
                    ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                    : state === "active"
                      ? "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                      : "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground/50"
                }
              >
                {state === "done" ? (
                  <Check className="h-3 w-3" />
                ) : state === "active" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <div className="min-w-0">
                <div
                  className={
                    state === "pending"
                      ? "text-sm font-medium text-muted-foreground"
                      : "text-sm font-medium text-foreground"
                  }
                >
                  {step.label}
                </div>
                <div className="text-[11px] leading-snug text-muted-foreground">{step.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

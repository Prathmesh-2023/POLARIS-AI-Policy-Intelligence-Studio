import { Info } from "lucide-react";

import type { Interpretation, ModelSummary } from "@/lib/polaris-api";

const UNCERTAINTY_STYLES: Record<string, string> = {
  tight: "border-success/40 bg-success/10 text-success",
  moderate: "border-warning/40 bg-warning/10 text-warning",
  wide: "border-danger/40 bg-danger/10 text-danger",
  pinned: "border-border bg-muted text-muted-foreground",
};

const UNCERTAINTY_WORD: Record<string, string> = {
  tight: "Narrow range",
  moderate: "Moderate range",
  wide: "Wide range",
  pinned: "Set by target",
};

function pp(value: number) {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)} pp`;
}

/** Where the projected gain sits inside its own 95% interval, drawn to scale
 * against zero so "could be no change" is visible rather than inferred. */
function RangeBar({ effect, low, high }: { effect: number; low: number; high: number }) {
  const min = Math.min(0, low);
  const max = Math.max(high, low + 0.01, 0.01);
  const span = max - min || 1;
  const pos = (v: number) => `${((v - min) / span) * 100}%`;
  const width = `${((high - low) / span) * 100}%`;

  return (
    <div aria-hidden="true" className="mt-1">
      <div className="relative h-8">
        {/* zero line — crossing it means "no change" is inside the range */}
        <div className="absolute inset-y-0 w-px bg-border" style={{ left: pos(0) }} />
        <div className="absolute top-3 h-2 rounded-full bg-primary/25" style={{ left: pos(low), width }} />
        <div
          className="absolute top-1.5 h-5 w-1 rounded-full bg-primary"
          style={{ left: pos(effect) }}
        />
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
        <span>{pp(low)}</span>
        <span className="font-medium text-foreground">{pp(effect)}</span>
        <span>{pp(high)}</span>
      </div>
    </div>
  );
}

/**
 * Plain-language reading of the quantitative projection.
 *
 * Every sentence here is computed by the backend from the same numbers the charts
 * use (`model_summary.interpretation`) — no LLM, so this panel cannot drift from
 * the figures it describes.
 */
export function WhatThisMeans({
  model,
  compact = false,
}: {
  model: ModelSummary | null | undefined;
  compact?: boolean;
}) {
  const interpretation: Interpretation | undefined = model?.interpretation;
  if (!model || !interpretation) return null;

  const { one_liner, reads, uncertainty, caveats, glossary } = interpretation;
  const chip = UNCERTAINTY_STYLES[uncertainty.label] ?? UNCERTAINTY_STYLES["pinned"];
  const chipWord = UNCERTAINTY_WORD[uncertainty.label] ?? uncertainty.label;

  if (compact) {
    return (
      <div className="rounded-xl border border-border bg-card/40 px-5 py-4">
        <div className="label-eyebrow">What this means</div>
        <p className="mt-2 text-sm text-foreground">{one_liner}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          95% range {pp(model.headline.ci_low)} to {pp(model.headline.ci_high)} — {chipWord.toLowerCase()}.
        </p>
      </div>
    );
  }

  return (
    <section className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="label-eyebrow">What this means</div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${chip}`}>
          {chipWord}
        </span>
      </div>

      <p className="mt-3 text-base font-medium leading-relaxed text-foreground">{one_liner}</p>

      <RangeBar
        effect={model.headline.effect}
        low={model.headline.ci_low}
        high={model.headline.ci_high}
      />

      <dl className="mt-5 grid gap-4 lg:grid-cols-2">
        {reads.map((read) => (
          <div key={read.label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {read.label}
            </dt>
            <dd className="mt-1 text-sm leading-relaxed text-foreground">{read.text}</dd>
          </div>
        ))}
      </dl>

      {caveats.length > 0 && (
        <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Before you quote this number
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {caveats.map((caveat) => (
              <li key={caveat} className="flex gap-2">
                <span aria-hidden="true">·</span>
                <span>{caveat}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {glossary.length > 0 && (
        <details className="no-print mt-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            What the terms mean
          </summary>
          <dl className="mt-3 space-y-2">
            {glossary.map((entry) => (
              <div key={entry.term}>
                <dt className="font-medium text-foreground">{entry.term}</dt>
                <dd className="text-muted-foreground">{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}

import { Gavel, MessagesSquare, ShieldCheck, ShieldQuestion, Sparkles } from "lucide-react";

import type { Debate, DebateTurn } from "@/lib/polaris-api";

const SPEAKER_META: Record<
  DebateTurn["speaker"],
  { align: "left" | "right" | "center"; icon: typeof ShieldCheck; tint: string; label: string }
> = {
  Proponent: {
    align: "left",
    icon: ShieldCheck,
    tint: "border-success/30 bg-success/10",
    label: "Proponent",
  },
  Skeptic: {
    align: "right",
    icon: ShieldQuestion,
    tint: "border-warning/30 bg-warning/10",
    label: "Skeptic",
  },
  Moderator: {
    align: "center",
    icon: Gavel,
    tint: "border-primary/30 bg-primary/10",
    label: "Moderator",
  },
};

function Bubble({ turn }: { turn: DebateTurn }) {
  const meta = SPEAKER_META[turn.speaker];
  const Icon = meta.icon;
  const align =
    meta.align === "right"
      ? "ml-auto items-end text-right"
      : meta.align === "center"
        ? "mx-auto items-center text-center"
        : "mr-auto items-start";
  return (
    <div className={`flex max-w-[85%] flex-col gap-1 ${align}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {meta.label}
      </div>
      <div className={`rounded-2xl border px-4 py-2.5 text-sm leading-relaxed ${meta.tint}`}>
        {turn.argument}
      </div>
    </div>
  );
}

export function DebateRoom({ debate }: { debate: Debate | null }) {
  if (!debate) return null;

  // Not triggered — show a calm "no debate needed" note so the absence is explained.
  if (!debate.triggered) {
    return (
      <div className="panel">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-muted-foreground" />
          <div className="label-eyebrow">Debate room</div>
        </div>
        <h2 className="mt-1 text-lg font-semibold">Not instantiated</h2>
        <p className="mt-1 text-sm text-muted-foreground">{debate.trigger_reason}</p>
      </div>
    );
  }

  const leaning = debate.resolution?.leaning;
  const leaningLabel =
    leaning === "proponent"
      ? "Evidence leans Proponent"
      : leaning === "skeptic"
        ? "Evidence leans Skeptic"
        : "Genuinely indeterminate";

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessagesSquare className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <div className="label-eyebrow">Debate room</div>
            <h2 className="mt-1 text-lg font-semibold leading-snug">Conflict detected — agents debating</h2>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3" /> Instantiated
        </span>
      </div>

      <div className="mt-3 rounded-xl border border-border/70 bg-secondary/40 px-4 py-3 text-sm">
        <span className="font-medium text-foreground">Why: </span>
        <span className="text-muted-foreground">{debate.trigger_reason}</span>
        {debate.disputed_topic && (
          <div className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Motion: </span>
            {debate.disputed_topic}
          </div>
        )}
      </div>

      {debate.error ? (
        <p className="mt-4 text-sm text-warning">{debate.error}</p>
      ) : (
        <div className="mt-5 space-y-6">
          {(debate.rounds ?? []).map((round) => (
            <div key={round.round}>
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  Round {round.round}
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-4">
                {round.turns.map((turn, i) => (
                  <Bubble key={`${round.round}-${i}`} turn={turn} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {debate.resolution && (
        <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Moderator ruling</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="font-medium text-primary">{leaningLabel}</span>
              <span className="text-muted-foreground">
                confidence {(debate.resolution.adjusted_confidence * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {debate.resolution.conclusion}
          </p>
        </div>
      )}
    </div>
  );
}

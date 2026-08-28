import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";

import type { AgentStatus, Run } from "@/lib/polaris-api";

function StatusIcon({ status }: { status: AgentStatus }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-danger" />;
  return <Circle className="h-4 w-4 text-muted-foreground/50" />;
}

function truncate(text: string, max = 160) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function AgentPanel({ agents }: { agents: Run["agents"] }) {
  const rows = [
    {
      key: "economic",
      label: "Economic",
      status: agents.economic.status,
      summary: agents.economic.output?.reasoning ?? null,
    },
    {
      key: "environment",
      label: "Environment",
      status: agents.environment.status,
      summary: agents.environment.output?.reasoning ?? null,
    },
    {
      key: "social",
      label: "Social",
      status: agents.social.status,
      summary: agents.social.output?.reasoning ?? null,
    },
    {
      key: "risk",
      label: "Risk",
      status: agents.risk.status,
      summary: agents.risk.output?.justification ?? null,
    },
  ];

  return (
    <div className="panel">
      <div className="label-eyebrow">Agent activity</div>
      <h2 className="mt-1 text-lg font-semibold">Four specialists</h2>

      <ul className="mt-5 space-y-3">
        {rows.map((row) => (
          <li
            key={row.key}
            className={
              "rounded-xl border border-border/70 bg-background/40 p-4 transition-colors " +
              (row.status === "running" ? "border-primary/50" : "")
            }
          >
            <div className="flex items-center gap-2">
              <StatusIcon status={row.status} />
              <span className="text-sm font-medium">{row.label}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                {row.status}
              </span>
            </div>
            {row.summary && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {truncate(row.summary)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

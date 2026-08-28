import {
  AlertTriangle,
  ArrowRight,
  FileText,
  Loader2,
  RefreshCcw,
  Trash2,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  deleteAllRuns,
  deleteRun,
  listRuns,
  NetworkUnreachableError,
  STATUS_LABELS,
  type RunSummary,
} from "@/lib/polaris-api";

function relativeTime(iso: string): string {
  // Stored timestamps are UTC ("YYYY-MM-DD HH:MM:SS" from SQLite datetime('now')).
  const ms = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(ms)) return iso;
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(ms).toLocaleDateString();
}

function riskClasses(risk: string | null): string {
  if (risk === "High") return "border-danger/40 bg-danger/10 text-danger";
  if (risk === "Low") return "border-success/40 bg-success/10 text-success";
  return "border-primary/40 bg-primary/10 text-primary";
}

function ReportRow({
  r,
  onOpen,
  onDelete,
  confirming,
  onConfirmToggle,
  busy,
}: {
  r: RunSummary;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  confirming: boolean;
  onConfirmToggle: (id: string | null) => void;
  busy: boolean;
}) {
  const done = r.status === "complete";
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border bg-card/40 pr-3 transition-colors hover:border-primary/40 hover:bg-accent/40">
      <button
        type="button"
        onClick={() => onOpen(r.run_id)}
        className="flex min-w-0 flex-1 items-center gap-4 px-5 py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {r.domain && <span className="label-eyebrow">{r.domain}</span>}
            <span className="text-xs text-muted-foreground">{relativeTime(r.created_at)}</span>
            {!done && (
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {STATUS_LABELS[r.status]}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-medium text-foreground">{r.policy_text}</p>
          {r.verdict && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{r.verdict}</p>
          )}
        </div>

        {done && r.overall_impact_score != null && (
          <div className="shrink-0 text-right">
            <div className="text-lg font-semibold tabular-nums text-foreground">
              {r.overall_impact_score.toFixed(0)}
            </div>
            <div className="label-eyebrow">impact</div>
          </div>
        )}

        {r.risk_level && (
          <span
            className={
              "hidden shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline " +
              riskClasses(r.risk_level)
            }
          >
            {r.risk_level} risk
          </span>
        )}

        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </button>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="destructive"
            size="sm"
            className="h-8"
            onClick={() => onDelete(r.run_id)}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => onConfirmToggle(null)}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onConfirmToggle(r.run_id)}
          aria-label="Delete report"
          className="shrink-0 rounded-lg p-2 text-muted-foreground/70 transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function ReportsView({ onOpen }: { onOpen: (runId: string) => void }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setUnreachable(false);
    try {
      setRuns(await listRuns(50));
    } catch (error) {
      if (error instanceof NetworkUnreachableError) setUnreachable(true);
      setRuns(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeOne = async (id: string) => {
    setBusyId(id);
    try {
      await deleteRun(id);
      setRuns((prev) => (prev ? prev.filter((r) => r.run_id !== id) : prev));
      setConfirmId(null);
    } catch {
      /* leave the row; a refresh will resync */
    } finally {
      setBusyId(null);
    }
  };

  const removeAll = async () => {
    setBusyAll(true);
    try {
      await deleteAllRuns();
      setRuns([]);
      setConfirmAll(false);
    } catch {
      /* ignore */
    } finally {
      setBusyAll(false);
    }
  };

  const hasRuns = Boolean(runs && runs.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <div className="label-eyebrow">Reports</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Analysis history</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every policy you&apos;ve analyzed, newest first. Open any run to revisit its full
              dashboard, model and evidence — or delete runs you no longer need.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasRuns &&
            (confirmAll ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void removeAll()}
                  disabled={busyAll}
                >
                  {busyAll ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                  )}
                  Delete all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmAll(false)}
                  disabled={busyAll}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirmAll(true)}>
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Clear all
              </Button>
            ))}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      {loading && !runs ? (
        <div className="panel flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
        </div>
      ) : unreachable ? (
        <div className="panel flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <WifiOff className="h-7 w-7 text-danger" />
          Can&apos;t reach the analysis server. Make sure the POLARIS backend is running.
        </div>
      ) : !hasRuns ? (
        <div className="panel flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
          <AlertTriangle className="h-7 w-7 text-muted-foreground/70" />
          No analyses yet. Submit a policy from the Dashboard to see it here.
        </div>
      ) : (
        <div className="space-y-3">
          {runs!.map((r) => (
            <ReportRow
              key={r.run_id}
              r={r}
              onOpen={onOpen}
              onDelete={removeOne}
              confirming={confirmId === r.run_id}
              onConfirmToggle={setConfirmId}
              busy={busyId === r.run_id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

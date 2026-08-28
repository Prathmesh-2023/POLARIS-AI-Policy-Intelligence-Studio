import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Printer, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AgentPanel } from "@/components/polaris/AgentPanel";
import { AgentsView } from "@/components/polaris/AgentsView";
import { CompareView } from "@/components/polaris/CompareView";
import { DebateRoom } from "@/components/polaris/DebateRoom";
import { ImpactNetwork } from "@/components/polaris/ImpactNetwork";
import { IndiaMap } from "@/components/polaris/IndiaMap";
import { KpiHeader } from "@/components/polaris/KpiHeader";
import { ModelImpactView } from "@/components/polaris/ModelImpactView";
import { PolicyForm } from "@/components/polaris/PolicyForm";
import { PolicyUnderstanding } from "@/components/polaris/PolicyUnderstanding";
import { ReasoningTrace } from "@/components/polaris/ReasoningTrace";
import { ReportsView } from "@/components/polaris/ReportsView";
import { SettingsView } from "@/components/polaris/SettingsView";
import { Sidebar, type ViewId } from "@/components/polaris/Sidebar";
import { TopBar } from "@/components/polaris/TopBar";
import { VerdictCard } from "@/components/polaris/VerdictCard";
import { WhatThisMeans } from "@/components/polaris/WhatThisMeans";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { clearAdminKey, setAdminKey, useAdminUnlocked } from "@/lib/admin";
import {
  ApiError,
  NetworkUnreachableError,
  checkAdmin,
  createRun,
  getRun,
  type LeverOverrides,
  type Run,
} from "@/lib/polaris-api";

const TITLE = "POLARIS — AI Policy Impact Dashboard for India";
const DESCRIPTION =
  "Submit an Indian public policy and watch four AI agents predict its economic, environmental, social and risk impact across states.";

/** Turn a failed submit into something the user can act on. A gate (401) or a
 * rate limit (429) carries a specific instruction from the backend, so show it
 * verbatim rather than burying it in a generic retry message. */
function submitErrorMessage(error: unknown, verb: "start" | "re-run"): string {
  if (error instanceof NetworkUnreachableError) {
    return "Can't reach the analysis server. Make sure the POLARIS backend is running and reachable.";
  }
  if (error instanceof ApiError && error.detail && (error.status === 401 || error.status === 429)) {
    return error.detail;
  }
  return verb === "start"
    ? "Couldn't start the analysis. Please try again."
    : "Couldn't re-run the analysis. Please try again.";
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [view, setView] = useState<ViewId>("dashboard");
  const pendingPolicy = useRef<string>("");
  const pendingHint = useRef<string | null>(null);

  // Owner gate for the Reports history. `adminConfigured` comes from the backend;
  // `adminUnlocked` reflects a validated key stored on this device. Reports is only
  // shown when there's no gate, or the owner has unlocked it here.
  const adminUnlocked = useAdminUnlocked();
  const [adminConfigured, setAdminConfigured] = useState(false);
  const reportsVisible = !adminConfigured || adminUnlocked;

  useEffect(() => {
    let cancelled = false;
    void checkAdmin().then((status) => {
      if (cancelled) return;
      setAdminConfigured(status.configured);
      // Drop a stale key that the backend no longer accepts.
      if (status.configured && !status.ok) clearAdminKey();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const unlockReports = useCallback(async (key: string) => {
    const status = await checkAdmin(key);
    if (status.configured && status.ok) {
      setAdminKey(key);
      return true;
    }
    return false;
  }, []);

  const lockReports = useCallback(() => {
    clearAdminKey();
    setView((v) => (v === "reports" ? "dashboard" : v));
  }, []);

  const submit = useCallback(async (policyText: string, domainHint: string | null) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const { run_id } = await createRun({ policy_text: policyText, domain_hint: domainHint });
      pendingPolicy.current = policyText;
      pendingHint.current = domainHint;
      setRun(null);
      setUnreachable(false);
      setRunId(run_id);
    } catch (error) {
      setFormError(submitErrorMessage(error, "start"));
    } finally {
      setSubmitting(false);
    }
  }, []);

  // Re-run the SAME policy text with user-corrected levers (from the
  // "I understood your policy as" card). Reads the policy from refs kept in sync
  // by the poll, so this callback is stable across the 1.5s poll ticks.
  const rerun = useCallback(async (overrides: LeverOverrides) => {
    const text = pendingPolicy.current;
    const hint = pendingHint.current;
    if (!text) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const { run_id } = await createRun({
        policy_text: text,
        domain_hint: hint,
        lever_overrides: overrides,
      });
      setRun(null);
      setUnreachable(false);
      setView("dashboard");
      setRunId(run_id);
    } catch (error) {
      setFormError(submitErrorMessage(error, "re-run"));
    } finally {
      setSubmitting(false);
    }
  }, []);

  // Poll while the run is in flight.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const next = await getRun(runId);
        if (cancelled) return;
        setRun(next);
        // Keep the re-run inputs current, including for a run re-opened from history.
        pendingPolicy.current = next.policy_input.policy_text;
        pendingHint.current = next.policy_input.domain_hint ?? null;
        setUnreachable(false);
        if (next.status !== "complete" && next.status !== "error") {
          timer = setTimeout(tick, 1500);
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof NetworkUnreachableError) setUnreachable(true);
        timer = setTimeout(tick, 3000);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId]);

  const reset = () => {
    setRunId(null);
    setRun(null);
    setUnreachable(false);
    setFormError(null);
    setView("dashboard");
  };

  // Re-open a past analysis from the Reports history. Polling picks it up and
  // stops immediately once it sees the stored "complete" status.
  const openRun = useCallback((id: string) => {
    setRun(null);
    setUnreachable(false);
    setFormError(null);
    pendingPolicy.current = "";
    pendingHint.current = null;
    setRunId(id);
    setView("dashboard");
  }, []);

  const policyText = run?.policy_input.policy_text ?? (runId ? pendingPolicy.current : undefined);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar active={view} onNavigate={setView} showReports={reportsVisible} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          policyText={policyText}
          status={run?.status}
          onChangePolicy={runId ? reset : undefined}
        />

        {view === "compare" ? (
          <main className="flex-1 p-6 lg:p-8">
            <CompareView />
          </main>
        ) : view === "reports" ? (
          <main className="flex-1 p-6 lg:p-8">
            {reportsVisible ? (
              <ReportsView onOpen={openRun} />
            ) : (
              <div className="panel mx-auto max-w-md text-center">
                <h2 className="text-lg font-semibold">Reports is locked</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enter the owner passcode in Settings to view the analysis history.
                </p>
                <Button className="mt-6" variant="outline" onClick={() => setView("settings")}>
                  Go to Settings
                </Button>
              </div>
            )}
          </main>
        ) : view === "settings" ? (
          <main className="flex-1 p-6 lg:p-8">
            <SettingsView
              adminConfigured={adminConfigured}
              adminUnlocked={adminUnlocked}
              onUnlock={unlockReports}
              onLock={lockReports}
            />
          </main>
        ) : !runId ? (
          <PolicyForm onSubmit={submit} submitting={submitting} errorMessage={formError} />
        ) : run?.status === "error" ? (
          <div className="flex flex-1 items-center justify-center px-6 py-16">
            <div className="panel max-w-md text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-danger" />
              <h2 className="mt-4 text-lg font-semibold">Analysis failed</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {run.error ?? "The analysis server reported an error."}
              </p>
              <Button className="mt-6" onClick={reset}>
                Try again
              </Button>
            </div>
          </div>
        ) : (
          <main className="flex-1 space-y-5 p-6 lg:p-8">
            {unreachable && (
              <div className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                <WifiOff className="h-4 w-4 shrink-0" />
                Can't reach the analysis server — retrying. Results below may be out of date.
              </div>
            )}

            {view === "agents" ? (
              <AgentsView
                agents={
                  run?.agents ?? {
                    economic: { status: "pending", output: null },
                    environment: { status: "pending", output: null },
                    social: { status: "pending", output: null },
                    risk: { status: "pending", output: null },
                  }
                }
              />
            ) : view === "network" ? (
              <ImpactNetwork run={run} />
            ) : view === "model" ? (
              <ModelImpactView run={run} />
            ) : (
              <>
                <div className="no-print">
                  <ReasoningTrace status={run?.status} />
                </div>

                {run?.status === "complete" && (
                  <div className="no-print flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                      <Printer className="mr-2 h-4 w-4" />
                      Export one-page brief
                    </Button>
                  </div>
                )}

                <KpiHeader synthesis={run?.synthesis ?? null} />

                <WhatThisMeans model={run?.model_summary} />

                {run?.parsed_policy && (
                  <PolicyUnderstanding
                    parsed={run.parsed_policy}
                    onRerun={rerun}
                    rerunning={submitting}
                  />
                )}

                <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <IndiaMap
                    stateImpact={run?.state_impact ?? null}
                    predictions={run?.model_predictions ?? null}
                    source={run?.state_impact_source ?? null}
                  />
                  <div className="space-y-4">
                    <AgentPanel
                      agents={
                        run?.agents ?? {
                          economic: { status: "pending", output: null },
                          environment: { status: "pending", output: null },
                          social: { status: "pending", output: null },
                          risk: { status: "pending", output: null },
                        }
                      }
                    />
                    <VerdictCard synthesis={run?.synthesis ?? null} />
                  </div>
                </div>

                {run?.debate && <DebateRoom debate={run.debate} />}

                {run?.model_summary && (
                  <button
                    type="button"
                    onClick={() => setView("model")}
                    className="no-print group flex w-full items-center justify-between rounded-xl border border-border bg-card/40 px-5 py-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <span>
                      <span className="label-eyebrow">Go deeper</span>
                      <span className="mt-0.5 block text-sm font-medium text-foreground">
                        Model &amp; Impact — projection, mechanism, distribution & sensitivity
                      </span>
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                )}
              </>
            )}
          </main>
        )}
      </div>
      <Toaster />
    </div>
  );
}

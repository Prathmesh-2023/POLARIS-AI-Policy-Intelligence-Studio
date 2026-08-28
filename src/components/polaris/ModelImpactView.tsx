import { LineChart } from "lucide-react";

import { EvidencePanel } from "@/components/polaris/EvidencePanel";
import { MechanismChain } from "@/components/polaris/MechanismChain";
import { ModelCard } from "@/components/polaris/ModelCard";
import { SensitivityTornado } from "@/components/polaris/SensitivityTornado";
import { WinnersLosers } from "@/components/polaris/WinnersLosers";
import { WhatThisMeans } from "@/components/polaris/WhatThisMeans";
import type { Run } from "@/lib/polaris-api";

/**
 * "Model & Impact" page — the quantitative deep-dive, split off the dashboard so
 * the overview stays scannable. Groups the calibrated model, its mechanism chain,
 * the distributional read, the sensitivity tornado and the sources behind them.
 */
export function ModelImpactView({ run }: { run: Run | null }) {
  const hasModel = Boolean(run?.model_summary);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LineChart className="h-5 w-5" />
        </span>
        <div>
          <div className="label-eyebrow">Model &amp; impact</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Quantitative deep-dive</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The calibrated projection, how the policy propagates to the outcome, where the gains
            land across states, how sensitive the result is to each lever, and the evidence behind
            it — every figure tied to a real lever or a computed model number.
          </p>
        </div>
      </header>

      {!hasModel ? (
        <div className="panel text-center text-sm text-muted-foreground">
          No quantitative model for this run yet. Submit a supported policy (EV / transport) to see
          the calibrated projection here.
        </div>
      ) : (
        <div className="space-y-6">
          <WhatThisMeans model={run?.model_summary} compact />

          {run?.classification && (
            <ModelCard model={run?.model_summary ?? null} classification={run.classification} />
          )}

          {run?.model_summary?.mechanism_chain && (
            <MechanismChain steps={run.model_summary.mechanism_chain} />
          )}

          {run?.model_summary?.distribution && (
            <WinnersLosers
              distribution={run.model_summary.distribution}
              outcomeLabel={run.model_summary.outcome_label}
            />
          )}

          {run?.model_summary?.sensitivity && (
            <SensitivityTornado sensitivity={run.model_summary.sensitivity} />
          )}

          {run?.evidence && <EvidencePanel evidence={run.evidence} />}
        </div>
      )}
    </div>
  );
}

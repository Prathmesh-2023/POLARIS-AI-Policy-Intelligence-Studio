import { Loader2, PencilLine, RotateCw, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LeverOverrides, Run } from "@/lib/polaris-api";

type Parsed = NonNullable<Run["parsed_policy"]>;
type Strength = "none" | "low" | "medium" | "high";
const STRENGTHS: Strength[] = ["none", "low", "medium", "high"];

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function LeverSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Strength;
  onChange: (v: Strength) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="label-eyebrow">{label}</label>
      <Select value={value} onValueChange={(v) => onChange(v as Strength)}>
        <SelectTrigger className="w-full capitalize">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STRENGTHS.map((s) => (
            <SelectItem key={s} value={s} className="capitalize">
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function PolicyUnderstanding({
  parsed,
  onRerun,
  rerunning,
}: {
  parsed: Parsed;
  onRerun: (overrides: LeverOverrides) => void;
  rerunning: boolean;
}) {
  const levers = parsed.levers;
  const initial = useMemo(
    () => ({
      incentive_strength: (levers?.incentive_strength ?? "medium") as Strength,
      infrastructure_push: (levers?.infrastructure_push ?? "low") as Strength,
      target_penetration_pct: levers?.target_penetration_pct ?? null,
      horizon_years: parsed.timeline_years,
    }),
    [levers?.incentive_strength, levers?.infrastructure_push, levers?.target_penetration_pct, parsed.timeline_years],
  );

  const [inc, setInc] = useState<Strength>(initial.incentive_strength);
  const [infra, setInfra] = useState<Strength>(initial.infrastructure_push);
  const [target, setTarget] = useState<string>(
    initial.target_penetration_pct != null ? String(initial.target_penetration_pct) : "",
  );
  const [horizon, setHorizon] = useState<string>(String(initial.horizon_years));

  // Re-sync editable fields whenever a new parse arrives.
  useEffect(() => {
    setInc(initial.incentive_strength);
    setInfra(initial.infrastructure_push);
    setTarget(initial.target_penetration_pct != null ? String(initial.target_penetration_pct) : "");
    setHorizon(String(initial.horizon_years));
  }, [initial]);

  const targetNum = target.trim() === "" ? null : Number(target);
  const horizonNum = Number(horizon);
  const dirty =
    inc !== initial.incentive_strength ||
    infra !== initial.infrastructure_push ||
    (targetNum ?? null) !== (initial.target_penetration_pct ?? null) ||
    horizonNum !== initial.horizon_years;

  const submit = () => {
    onRerun({
      incentive_strength: inc,
      infrastructure_push: infra,
      target_penetration_pct:
        targetNum != null && Number.isFinite(targetNum) ? targetNum : null,
      horizon_years: Number.isFinite(horizonNum) ? horizonNum : null,
    });
  };

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wand2 className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <div className="label-eyebrow">I understood your policy as</div>
            <h2 className="mt-1 text-lg font-semibold leading-snug">
              {parsed.domain} policy · {parsed.timeline_years}-year horizon
            </h2>
          </div>
        </div>
        {parsed.levers_overridden && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            <PencilLine className="h-3 w-3" /> Adjusted by you
          </span>
        )}
      </div>

      {parsed.goals.length > 0 && (
        <div className="mt-4">
          <div className="label-eyebrow">Goals</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {parsed.goals.slice(0, 6).map((g, i) => (
              <Tag key={i}>{g}</Tag>
            ))}
          </div>
        </div>
      )}

      {parsed.affected_sectors.length > 0 && (
        <div className="mt-3">
          <div className="label-eyebrow">Affected sectors</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {parsed.affected_sectors.slice(0, 6).map((s, i) => (
              <Tag key={i}>{s}</Tag>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-border bg-secondary/40 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          These levers drive the quantitative projection. If I mis-read the policy, correct
          them and re-run — the model, map and mechanism update accordingly.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LeverSelect label="Incentive strength" value={inc} onChange={setInc} />
          <LeverSelect label="Infrastructure push" value={infra} onChange={setInfra} />
          <div className="space-y-1.5">
            <label className="label-eyebrow" htmlFor="pu-target">
              Target %
            </label>
            <Input
              id="pu-target"
              inputMode="numeric"
              placeholder="none"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="label-eyebrow" htmlFor="pu-horizon">
              Horizon (years)
            </label>
            <Input
              id="pu-horizon"
              inputMode="numeric"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={submit} disabled={rerunning || !dirty} size="sm">
            {rerunning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="mr-2 h-4 w-4" />
            )}
            Re-run with these levers
          </Button>
          {dirty && !rerunning && (
            <span className="text-xs text-muted-foreground">Unsaved changes — re-run to apply.</span>
          )}
        </div>
      </div>
    </div>
  );
}

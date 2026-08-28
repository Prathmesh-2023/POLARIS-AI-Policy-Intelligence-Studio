import { ArrowRight, GitCompareArrows, Loader2, Scale } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  NetworkUnreachableError,
  compareModel,
  type CompareResult,
  type CompareVariant,
} from "@/lib/polaris-api";

type Strength = "none" | "low" | "medium" | "high";
const STRENGTHS: Strength[] = ["none", "low", "medium", "high"];

const DEFAULT_A: CompareVariant = {
  label: "Subsidy-led",
  incentive_strength: "high",
  infrastructure_push: "low",
  horizon_years: 5,
};
const DEFAULT_B: CompareVariant = {
  label: "Infrastructure-led",
  incentive_strength: "low",
  infrastructure_push: "high",
  horizon_years: 5,
};

function fmtPP(v: number | null | undefined): string {
  if (v == null) return "–";
  const r = Math.abs(v) < 0.005 ? 0 : v;
  return `${r > 0 ? "+" : ""}${r.toFixed(2)}`;
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

function VariantEditor({
  title,
  accent,
  variant,
  onChange,
}: {
  title: string;
  accent: "a" | "b";
  variant: CompareVariant;
  onChange: (v: CompareVariant) => void;
}) {
  const ring = accent === "a" ? "border-primary/30" : "border-success/40";
  const dot = accent === "a" ? "bg-primary" : "bg-success";
  return (
    <div className={`rounded-xl border ${ring} bg-secondary/30 p-4`}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <Input
          value={variant.label ?? ""}
          onChange={(e) => onChange({ ...variant, label: e.target.value })}
          className="h-8 max-w-[220px] font-semibold"
          aria-label={`${title} name`}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <LeverSelect
          label="Incentives"
          value={(variant.incentive_strength ?? "medium") as Strength}
          onChange={(v) => onChange({ ...variant, incentive_strength: v })}
        />
        <LeverSelect
          label="Infrastructure"
          value={(variant.infrastructure_push ?? "low") as Strength}
          onChange={(v) => onChange({ ...variant, infrastructure_push: v })}
        />
        <div className="space-y-1.5">
          <label className="label-eyebrow">Horizon (yrs)</label>
          <Input
            type="number"
            min={1}
            max={15}
            value={variant.horizon_years ?? 5}
            onChange={(e) =>
              onChange({ ...variant, horizon_years: Number(e.target.value) || 5 })
            }
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <label className="label-eyebrow">Target %</label>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="none"
            value={variant.target_penetration_pct ?? ""}
            onChange={(e) =>
              onChange({
                ...variant,
                target_penetration_pct: e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="h-9"
          />
        </div>
      </div>
    </div>
  );
}

function HeadlineCard({
  label,
  accent,
  headline,
}: {
  label: string;
  accent: "a" | "b";
  headline: CompareResult["a"]["headline"];
}) {
  const tone = accent === "a" ? "text-primary" : "text-success";
  return (
    <div className="rounded-xl border border-border/70 bg-secondary/30 p-4">
      <div className="text-sm font-semibold text-foreground">{label}</div>
      {headline.baseline_value != null && headline.projected_value != null && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-lg font-semibold tabular-nums text-foreground">
            {headline.baseline_value.toFixed(1)}%
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={`text-lg font-semibold tabular-nums ${tone}`}>
            {headline.projected_value.toFixed(1)}%
          </span>
        </div>
      )}
      <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">
        {fmtPP(headline.effect)} pp
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        95% range {fmtPP(headline.ci_low)} to {fmtPP(headline.ci_high)}
      </div>
    </div>
  );
}

function DeltaList({
  title,
  rows,
  favors,
}: {
  title: string;
  rows: CompareResult["per_state"];
  favors: "a" | "b";
}) {
  const tone = favors === "a" ? "text-primary" : "text-success";
  const max = Math.max(1e-6, ...rows.map((r) => Math.abs(r.delta)));
  return (
    <div>
      <div className="label-eyebrow">{title}</div>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const w = Math.max(4, (Math.abs(r.delta) / max) * 100);
          return (
            <li key={r.state} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0 truncate text-foreground">{r.state}</span>
              <div className="h-2 flex-1 rounded-full bg-secondary/60">
                <div
                  className={favors === "a" ? "h-2 rounded-full bg-primary/70" : "h-2 rounded-full bg-success/70"}
                  style={{ width: `${w}%` }}
                />
              </div>
              <span className={`w-16 shrink-0 text-right tabular-nums font-medium ${tone}`}>
                {fmtPP(r.delta)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CompareView() {
  const [a, setA] = useState<CompareVariant>(DEFAULT_A);
  const [b, setB] = useState<CompareVariant>(DEFAULT_B);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await compareModel({ a, b });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof NetworkUnreachableError
          ? "Can't reach the analysis server. Make sure the POLARIS backend is running."
          : "Comparison failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-primary" />
          <div className="label-eyebrow">A/B policy compare</div>
        </div>
        <h2 className="mt-1 text-lg font-semibold">Compare two EV-policy designs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Same calibrated model, two lever sets — see how the projected national effect and the
          winning states differ by design. Quantitative projection only (EV transport), so it runs
          instantly with no LLM calls.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <VariantEditor title="Variant A" accent="a" variant={a} onChange={setA} />
          <VariantEditor title="Variant B" accent="b" variant={b} onChange={setB} />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={run} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Scale className="mr-2 h-4 w-4" />
            )}
            Run comparison
          </Button>
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </div>

      {result && (
        <div className="panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold">Result</h3>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {result.labels.b} vs {result.labels.a}: {fmtPP(result.headline_delta)} pp
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <HeadlineCard label={result.labels.a} accent="a" headline={result.a.headline} />
            <HeadlineCard label={result.labels.b} accent="b" headline={result.b.headline} />
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <DeltaList
              title={`States ${result.labels.b} lifts most vs ${result.labels.a}`}
              rows={result.b_favors}
              favors="b"
            />
            <DeltaList
              title={`States ${result.labels.a} lifts most vs ${result.labels.b}`}
              rows={result.a_favors}
              favors="a"
            />
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Δ is variant B&apos;s projected per-state effect minus variant A&apos;s. A positive Δ
            means that state gains more under {result.labels.b}; negative means it gains more under{" "}
            {result.labels.a}.
          </p>
        </div>
      )}
    </div>
  );
}

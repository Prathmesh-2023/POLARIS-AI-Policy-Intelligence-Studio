import { Skeleton } from "@/components/ui/skeleton";
import type { Run } from "@/lib/polaris-api";

function Gauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const stroke =
    clamped >= 66 ? "var(--success)" : clamped >= 33 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--muted)" strokeWidth="10" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 800ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums">{Math.round(clamped)}</span>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel flex flex-col">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-4 flex flex-1 items-center justify-center">{children}</div>
    </div>
  );
}

export function KpiHeader({ synthesis }: { synthesis: Run["synthesis"] }) {
  const riskStyles: Record<string, string> = {
    Low: "border-success/40 bg-success/10 text-success",
    Medium: "border-warning/40 bg-warning/10 text-warning",
    High: "border-danger/40 bg-danger/10 text-danger",
  };

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card label="Overall impact score">
        {synthesis ? <Gauge value={synthesis.overall_impact_score} /> : <Skeleton className="h-32 w-32 rounded-full" />}
      </Card>

      <Card label="Risk level">
        {synthesis ? (
          <span
            className={`rounded-full border px-6 py-2 text-2xl font-semibold ${riskStyles[synthesis.risk_level] ?? ""}`}
          >
            {synthesis.risk_level}
          </span>
        ) : (
          <Skeleton className="h-12 w-32 rounded-full" />
        )}
      </Card>

      <Card label="Confidence">
        {synthesis ? (
          <div className="w-full space-y-3 text-center">
            <div className="text-4xl font-semibold tabular-nums text-primary">
              {Math.round(
                synthesis.confidence <= 1 ? synthesis.confidence * 100 : synthesis.confidence,
              )}
              %
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{
                  width: `${Math.round(
                    synthesis.confidence <= 1 ? synthesis.confidence * 100 : synthesis.confidence,
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <Skeleton className="h-12 w-32" />
        )}
      </Card>
    </div>
  );
}

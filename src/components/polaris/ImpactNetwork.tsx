import { Network } from "lucide-react";
import { useMemo, useState } from "react";

import type { Run } from "@/lib/polaris-api";

type NodeKind = "policy" | "dimension" | "metric" | "risk";
type GNode = {
  id: string;
  x: number;
  y: number;
  r: number;
  kind: NodeKind;
  color: string;
  label: string;
  detail?: string;
  confidence?: number;
};
type GEdge = { id: string; x1: number; y1: number; x2: number; y2: number; w: number };

const W = 760;
const H = 520;
const CX = W / 2;
const CY = H / 2;
const R1 = 132; // dimension ring
const R2 = 216; // leaf ring

const DIR_COLOR: Record<string, string> = {
  up: "var(--success)",
  down: "var(--danger)",
  flat: "var(--muted-foreground)",
};
const MAG_R: Record<string, number> = { small: 7, moderate: 10, large: 14 };

const DIMS = [
  { key: "economic", label: "Economic", angle: -90 },
  { key: "environment", label: "Environment", angle: 0 },
  { key: "social", label: "Social", angle: 90 },
  { key: "risk", label: "Risk", angle: 180 },
] as const;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function buildGraph(run: Run | null): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  if (!run) return { nodes, edges };

  const policyLabel = run.parsed_policy?.domain || "Policy";
  nodes.push({
    id: "policy",
    x: CX,
    y: CY,
    r: 26,
    kind: "policy",
    color: "var(--primary)",
    label: policyLabel,
    detail: "Policy under analysis",
  });

  for (const dim of DIMS) {
    const p = polar(CX, CY, R1, dim.angle);
    const dimId = `dim-${dim.key}`;
    nodes.push({
      id: dimId,
      x: p.x,
      y: p.y,
      r: 15,
      kind: "dimension",
      color: "var(--primary)",
      label: dim.label,
    });
    edges.push({ id: `e-${dimId}`, x1: CX, y1: CY, x2: p.x, y2: p.y, w: 2 });

    if (dim.key === "risk") {
      const out = run.agents.risk.output;
      if (out) {
        const lp = polar(CX, CY, R2, dim.angle);
        const color =
          out.risk_level === "High"
            ? "var(--danger)"
            : out.risk_level === "Low"
              ? "var(--success)"
              : "var(--warning)";
        nodes.push({
          id: "risk-leaf",
          x: lp.x,
          y: lp.y,
          r: 12,
          kind: "risk",
          color,
          label: `${out.risk_level} risk`,
          detail: out.justification,
          confidence: out.confidence,
        });
        edges.push({
          id: "e-risk-leaf",
          x1: p.x,
          y1: p.y,
          x2: lp.x,
          y2: lp.y,
          w: 1 + out.confidence * 3,
        });
      }
      continue;
    }

    const agent = run.agents[dim.key as "economic" | "environment" | "social"];
    const effects = (agent.output?.metric_effects ?? []).slice(0, 4);
    const spread = 46; // total degrees to fan the leaves across
    effects.forEach((eff, i) => {
      const t = effects.length === 1 ? 0 : i / (effects.length - 1) - 0.5;
      const a = dim.angle + t * spread;
      const lp = polar(CX, CY, R2, a);
      const id = `${dimId}-m${i}`;
      nodes.push({
        id,
        x: lp.x,
        y: lp.y,
        r: MAG_R[eff.magnitude] ?? 10,
        kind: "metric",
        color: DIR_COLOR[eff.direction] ?? "var(--muted-foreground)",
        label: eff.metric,
        detail: `${dim.label} · ${eff.direction} · ${eff.magnitude}`,
        confidence: eff.confidence,
      });
      edges.push({ id: `e-${id}`, x1: p.x, y1: p.y, x2: lp.x, y2: lp.y, w: 1 + eff.confidence * 3 });
    });
  }
  return { nodes, edges };
}

export function ImpactNetwork({ run }: { run: Run | null }) {
  const { nodes, edges } = useMemo(() => buildGraph(run), [run]);
  const [hover, setHover] = useState<GNode | null>(null);

  const hasData = nodes.length > 1;

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Network className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <div className="label-eyebrow">Impact &amp; influence network</div>
            <h2 className="mt-1 text-lg font-semibold leading-snug">
              How the policy propagates through the analysis
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--success)" }} /> increases
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--danger)" }} /> decreases
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--primary)" }} /> dimension
          </span>
          <span>· size = magnitude · edge = confidence · flow = influence</span>
        </div>
      </div>

      {!hasData ? (
        <p className="mt-6 text-sm text-muted-foreground">
          The network appears once the agents finish their analysis.
        </p>
      ) : (
        <div className="relative mt-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Impact and influence network">
            <style>{`
              .net-flow { animation: netFlow 2.6s linear infinite; }
              @keyframes netFlow { to { stroke-dashoffset: -32; } }
              .net-node { animation: netNodeIn .55s ease-out both; }
              @keyframes netNodeIn { from { opacity: 0 } to { opacity: 1 } }
              .net-halo { transform-box: fill-box; transform-origin: center; animation: netHalo 3s ease-in-out infinite; }
              @keyframes netHalo { 0%,100% { transform: scale(1); opacity: .28 } 50% { transform: scale(1.55); opacity: 0 } }
              .net-ring { animation: netDash 9s linear infinite; }
              @keyframes netDash { to { stroke-dashoffset: -64; } }
              @media (prefers-reduced-motion: reduce) {
                .net-flow, .net-node, .net-halo, .net-ring { animation: none !important; }
              }
            `}</style>
            <defs>
              <radialGradient id="net-bg" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.06" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
              </radialGradient>
              <filter id="net-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect x="0" y="0" width={W} height={H} fill="url(#net-bg)" />
            <circle cx={CX} cy={CY} r={R1} fill="none" stroke="var(--border)" strokeDasharray="2 6" className="net-ring" />
            <circle cx={CX} cy={CY} r={R2} fill="none" stroke="var(--border)" strokeDasharray="2 6" className="net-ring" />

            {edges.map((e) => (
              <line
                key={e.id}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke="var(--primary)"
                strokeOpacity={0.28}
                strokeWidth={e.w}
                strokeLinecap="round"
              />
            ))}

            {/* Animated influence "flow" travelling from the policy outward. */}
            {edges.map((e, i) => (
              <line
                key={`flow-${e.id}`}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke="var(--primary)"
                strokeOpacity={0.9}
                strokeWidth={Math.min(e.w, 2.5)}
                strokeLinecap="round"
                strokeDasharray="2 14"
                className="net-flow"
                style={{ animationDelay: `${(i % 6) * 0.22}s` }}
              />
            ))}

            {nodes.map((n, i) => {
              const active = hover?.id === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover((h) => (h?.id === n.id ? null : h))}
                  className="net-node cursor-pointer"
                  style={{ animationDelay: `${0.15 + i * 0.05}s` }}
                >
                  {n.kind === "policy" && (
                    <circle className="net-halo" r={n.r} fill={n.color} fillOpacity={0.25} />
                  )}
                  <circle
                    r={n.r}
                    fill={n.color}
                    fillOpacity={n.kind === "policy" ? 0.95 : 0.9}
                    stroke="var(--card)"
                    strokeWidth={2}
                    filter={active ? "url(#net-glow)" : undefined}
                  />
                  {n.confidence !== undefined && (
                    <circle
                      r={n.r + 3}
                      fill="none"
                      stroke={n.color}
                      strokeOpacity={0.35}
                      strokeWidth={1}
                      strokeDasharray={`${Math.max(1, n.confidence * 2 * Math.PI * (n.r + 3))} ${
                        2 * Math.PI * (n.r + 3)
                      }`}
                      transform="rotate(-90)"
                    />
                  )}
                  {(n.kind === "policy" || n.kind === "dimension") && (
                    <text
                      textAnchor="middle"
                      dy={n.kind === "policy" ? 4 : n.r + 14}
                      className="pointer-events-none fill-foreground text-[11px] font-semibold"
                    >
                      {n.label.length > 16 ? `${n.label.slice(0, 15)}…` : n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {hover && (hover.kind === "metric" || hover.kind === "risk") && (
            <div className="pointer-events-none absolute left-1/2 top-3 w-64 -translate-x-1/2 rounded-xl border border-border bg-popover px-3 py-2 text-center shadow-lg">
              <div className="text-sm font-medium text-foreground">{hover.label}</div>
              {hover.detail && (
                <div className="mt-0.5 text-xs text-muted-foreground">{hover.detail}</div>
              )}
              {hover.confidence !== undefined && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  confidence {Math.round(hover.confidence * 100)}%
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

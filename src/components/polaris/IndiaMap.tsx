import { useMemo, useState } from "react";

import geo from "@/data/india-states.geo.json";
import type { StatePrediction } from "@/lib/polaris-api";

type Geometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

type Feature = {
  type: "Feature";
  properties: { name: string };
  geometry: Geometry;
};

const ALIASES: Record<string, string> = {
  odisha: "orissa",
  uttarakhand: "uttaranchal",
  telangana: "andhra pradesh",
  "nct of delhi": "delhi",
  "jammu & kashmir": "jammu and kashmir",
  "andaman & nicobar islands": "andaman and nicobar",
  pondicherry: "puducherry",
};

function normalize(name: string) {
  const key = name.trim().toLowerCase();
  return ALIASES[key] ?? key;
}

function colorFor(score: number) {
  // Single-hue indigo sequential ramp: pale (low) -> deep indigo (high).
  const t = Math.max(0, Math.min(100, score)) / 100;
  const stops: [number, number, number][] = [
    [237, 239, 251],
    [124, 134, 217],
    [55, 48, 163],
  ];
  const seg = t < 0.5 ? 0 : 1;
  const local = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = stops[seg]!;
  const b = stops[seg + 1]!;
  const mix = a.map((v, i) => Math.round(v + (b[i]! - v) * local));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

function fmtPP(value: number): string {
  const v = Math.abs(value) < 0.005 ? 0 : value;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}

type HoverState = {
  name: string;
  score: number | null;
  pred: StatePrediction | null;
  x: number;
  y: number;
};

export function IndiaMap({
  stateImpact,
  predictions,
  source,
}: {
  stateImpact: Record<string, number> | null;
  predictions?: StatePrediction[] | null;
  source?: "quantitative_model" | "llm_estimate" | null;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);

  const features = (geo as unknown as { features: Feature[] }).features;

  const { paths } = useMemo(() => {
    const width = 760;
    const height = 820;
    const merc = (lon: number, lat: number): [number, number] => [
      (lon * Math.PI) / 180,
      Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
    ];

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const eachRing = (geometry: Geometry, fn: (ring: number[][]) => void) => {
      if (geometry.type === "Polygon") {
        for (const ring of geometry.coordinates) fn(ring as number[][]);
      } else if (geometry.type === "MultiPolygon") {
        for (const poly of geometry.coordinates) for (const ring of poly) fn(ring as number[][]);
      }
    };

    for (const feature of features) {
      eachRing(feature.geometry, (ring) => {
        for (const [lon, lat] of ring) {
          const [x, y] = merc(lon as number, lat as number);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      });
    }

    const scale = Math.min(width / (maxX - minX), height / (maxY - minY));
    const offsetX = (width - (maxX - minX) * scale) / 2;
    const offsetY = (height - (maxY - minY) * scale) / 2;
    const project = (lon: number, lat: number) => {
      const [x, y] = merc(lon, lat);
      return [
        (x - minX) * scale + offsetX,
        height - offsetY - (y - minY) * scale,
      ] as const;
    };

    return {
      paths: features.map((feature) => {
        let d = "";
        eachRing(feature.geometry, (ring) => {
          ring.forEach(([lon, lat], i) => {
            const [px, py] = project(lon as number, lat as number);
            d += `${i === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`;
          });
          d += "Z";
        });
        return { name: feature.properties.name, d };
      }),
    };
  }, [features]);

  const lookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, value] of Object.entries(stateImpact ?? {})) {
      map.set(normalize(key), value);
    }
    return map;
  }, [stateImpact]);

  const predLookup = useMemo(() => {
    const map = new Map<string, StatePrediction>();
    for (const p of predictions ?? []) {
      if (p?.state) map.set(normalize(p.state), p);
    }
    return map;
  }, [predictions]);

  const sourceLabel =
    source === "quantitative_model"
      ? "Model prediction"
      : source === "llm_estimate"
        ? "Estimated"
        : null;

  return (
    <div className="panel relative flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label-eyebrow">Geographic distribution</div>
          <h2 className="mt-1 text-lg font-semibold">India state impact</h2>
        </div>
        <div className="flex items-center gap-4">
          {sourceLabel && (
            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {sourceLabel}
            </span>
          )}
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Low
            <span
              className="h-2 w-28 rounded-full"
              style={{
                background: `linear-gradient(to right, ${colorFor(0)}, ${colorFor(50)}, ${colorFor(100)})`,
              }}
            />
            High
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex-1">
        <svg viewBox="0 0 760 820" className="h-full max-h-[620px] w-full">
          {paths.map((p) => {
            const key = normalize(p.name);
            const score = lookup.get(key);
            const pred = predLookup.get(key) ?? null;
            return (
              <path
                key={p.name}
                d={p.d}
                fill={score == null ? "var(--muted)" : colorFor(score)}
                stroke="var(--card)"
                strokeWidth={0.9}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseMove={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({
                    name: p.name,
                    score: score ?? null,
                    pred,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  });
                }}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({
                    name: p.name,
                    score: score ?? null,
                    pred,
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  });
                }}
              />
            );
          })}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg"
            style={{ left: hover.x, top: hover.y - 8 }}
          >
            <div className="font-medium text-popover-foreground">{hover.name}</div>
            {hover.pred ? (
              <div className="mt-1 space-y-0.5 text-muted-foreground">
                <div>
                  Predicted:{" "}
                  <span className="font-medium text-popover-foreground tabular-nums">
                    {hover.pred.predicted_value.toFixed(1)}%
                  </span>
                </div>
                <div>
                  Policy effect:{" "}
                  <span className="font-medium text-popover-foreground tabular-nums">
                    {fmtPP(hover.pred.policy_effect)} pp
                  </span>
                </div>
                <div className="tabular-nums">
                  95% CI {fmtPP(hover.pred.ci_lower)} to {fmtPP(hover.pred.ci_upper)}
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">
                {hover.score == null ? "No data" : `Impact ${Math.round(hover.score)} / 100`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

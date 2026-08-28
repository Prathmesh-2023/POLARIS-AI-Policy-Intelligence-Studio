import { Skeleton } from "@/components/ui/skeleton";
import type { Run } from "@/lib/polaris-api";

export function VerdictCard({ synthesis }: { synthesis: Run["synthesis"] }) {
  return (
    <div className="panel">
      <div className="label-eyebrow">Synthesis</div>
      {synthesis ? (
        <>
          <h2 className="mt-2 text-xl font-semibold leading-snug">{synthesis.verdict}</h2>
          <ul className="mt-4 space-y-2">
            {synthesis.top_3_effects.map((effect, i) => (
              <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{effect}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
    </div>
  );
}

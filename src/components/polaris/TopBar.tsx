import { RefreshCcw } from "lucide-react";

import { ThemeSwitcher } from "@/components/polaris/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS, type RunStatus } from "@/lib/polaris-api";

export function TopBar({
  policyText,
  status,
  onChangePolicy,
}: {
  policyText?: string | undefined;
  status?: RunStatus | undefined;
  onChangePolicy?: (() => void) | undefined;
}) {
  const busy = status && status !== "complete" && status !== "error";

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card/40 px-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="label-eyebrow">Current policy</div>
        <p className="truncate text-sm text-foreground">
          {policyText ? policyText : "No policy submitted yet"}
        </p>
      </div>

      {status && (
        <span
          className={
            "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium " +
            (status === "error"
              ? "border-danger/40 bg-danger/10 text-danger"
              : status === "complete"
                ? "border-success/40 bg-success/10 text-success"
                : "border-primary/40 bg-primary/10 text-primary")
          }
        >
          <span
            className={
              "h-1.5 w-1.5 rounded-full bg-current " + (busy ? "animate-pulse" : "")
            }
          />
          {STATUS_LABELS[status]}
        </span>
      )}

      {onChangePolicy && (
        <Button variant="outline" size="sm" onClick={onChangePolicy}>
          <RefreshCcw className="mr-2 h-3.5 w-3.5" />
          Change Policy
        </Button>
      )}

      <ThemeSwitcher />
    </header>
  );
}

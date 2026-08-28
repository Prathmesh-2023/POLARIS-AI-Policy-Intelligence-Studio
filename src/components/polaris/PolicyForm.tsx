import { Loader2, Sparkles, WifiOff } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const DOMAINS = [
  { value: "economic", label: "Economic" },
  { value: "environmental", label: "Environmental" },
  { value: "social", label: "Social" },
  { value: "unsure", label: "Not sure" },
];

export function PolicyForm({
  onSubmit,
  submitting,
  errorMessage,
}: {
  onSubmit: (policyText: string, domainHint: string | null) => void;
  submitting: boolean;
  errorMessage: string | null;
}) {
  const [text, setText] = useState("");
  const [domain, setDomain] = useState("unsure");

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="label-eyebrow">New analysis</div>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Predict the impact of a public policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Four specialist agents assess economic, environmental, social and risk outcomes across
        Indian states.
      </p>

      <form
        className="panel mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSubmit(text.trim(), domain === "unsure" ? null : domain);
        }}
      >
        <div className="space-y-2">
          <label className="label-eyebrow" htmlFor="policy">
            Policy description
          </label>
          <Textarea
            id="policy"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe the policy you want to analyze..."
            className="min-h-44 resize-y text-base"
          />
        </div>

        <div className="space-y-2">
          <label className="label-eyebrow">Domain hint</label>
          <Select value={domain} onValueChange={setDomain}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOMAINS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <Button type="submit" size="lg" disabled={submitting || !text.trim()} className="w-full sm:w-auto">
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Run analysis
        </Button>
      </form>
    </div>
  );
}

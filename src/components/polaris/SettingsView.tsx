import {
  Check,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  LockOpen,
  Plug,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_BASE_URL, checkHealth, type HealthResult } from "@/lib/polaris-api";
import { clearGroqKey, maskKey, setGroqKey, useGroqKey } from "@/lib/groq-key";
import {
  applyTheme,
  readSavedTheme,
  saveTheme,
  THEMES,
  type ThemeDef,
  type ThemeId,
} from "@/lib/theme";

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="label-eyebrow">{eyebrow}</div>
      <h2 className="mt-1 text-base font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ConnectionSection() {
  const [health, setHealth] = useState<HealthResult | null>(null);
  const [checking, setChecking] = useState(false);

  const probe = async () => {
    setChecking(true);
    setHealth(await checkHealth());
    setChecking(false);
  };

  useEffect(() => {
    void probe();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-secondary/30 px-4 py-3">
        <div className="min-w-0">
          <div className="label-eyebrow">Backend URL</div>
          <code className="text-sm text-foreground">{API_BASE_URL}</code>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          set via VITE_API_BASE_URL
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => void probe()} disabled={checking}>
          {checking ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="mr-2 h-3.5 w-3.5" />
          )}
          Test connection
        </Button>
        {health &&
          (health.ok ? (
            <span className="flex items-center gap-1.5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              Connected · {health.latencyMs} ms
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-danger">
              <XCircle className="h-4 w-4" />
              Unreachable
            </span>
          ))}
      </div>
    </div>
  );
}

function ApiKeySection() {
  const stored = useGroqKey();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  const save = () => {
    const key = value.trim();
    if (!key) return;
    setGroqKey(key);
    setValue("");
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const remove = () => {
    clearGroqKey();
    setValue("");
    setSaved(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Bring your own <span className="text-foreground">Groq</span> API key to run analyses on your
        own quota. It is stored only in this browser and sent with each analysis you start — never
        saved on the server. Leave this empty to use the server&apos;s configured key.
      </p>

      {stored ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/10 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            Using your key on this device · <code className="text-foreground">{maskKey(stored)}</code>
          </span>
          <Button variant="outline" size="sm" onClick={remove}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          No personal key set — analyses use the server&apos;s key.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={value}
          placeholder="gsk_…"
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          className="h-9 max-w-sm font-mono"
          aria-label="Groq API key"
        />
        <Button size="sm" onClick={save} disabled={!value.trim()}>
          {saved ? <Check className="mr-2 h-3.5 w-3.5" /> : <KeyRound className="mr-2 h-3.5 w-3.5" />}
          {stored ? "Replace key" : "Save key"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Get a free key at{" "}
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2"
        >
          console.groq.com/keys
        </a>
        .
      </p>
    </div>
  );
}

function AppearanceSection() {
  const [active, setActive] = useState<ThemeId>("paper");

  useEffect(() => {
    setActive(readSavedTheme().id);
  }, []);

  const select = (theme: ThemeDef) => {
    applyTheme(theme);
    saveTheme(theme);
    setActive(theme.id);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {THEMES.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => select(t)}
            className={
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors " +
              (isActive
                ? "border-primary/60 bg-accent/40 ring-1 ring-primary/30"
                : "border-border hover:border-primary/40 hover:bg-accent/30")
            }
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10"
              style={{ background: t.swatch[0] }}
              aria-hidden
            >
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: t.swatch[1] }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{t.label}</span>
              <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
            </span>
            {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function OwnerAccessSection({
  configured,
  unlocked,
  onUnlock,
  onLock,
}: {
  configured: boolean;
  unlocked: boolean;
  onUnlock: (key: string) => Promise<boolean>;
  onLock: () => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const submit = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setError(false);
    const ok = await onUnlock(key.trim());
    setBusy(false);
    if (ok) setKey("");
    else setError(true);
  };

  if (!configured) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          No owner passcode is set, so the Reports history is visible to everyone. To hide it after
          deployment, set <code className="text-foreground">POLARIS_ADMIN_KEY</code> in the
          backend&apos;s environment and restart it — the Reports tab will then stay hidden until you
          unlock it here.
        </p>
      </div>
    );
  }

  if (unlocked) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm text-success">
          <LockOpen className="h-4 w-4" />
          Unlocked on this device — Reports is visible to you.
        </span>
        <Button variant="outline" size="sm" onClick={onLock}>
          <Lock className="mr-2 h-3.5 w-3.5" />
          Lock &amp; hide Reports
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Reports is hidden. Enter the owner passcode to view and manage the analysis history on this
        device.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="password"
          value={key}
          placeholder="Owner passcode"
          autoComplete="off"
          onChange={(e) => {
            setKey(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          className="h-9 max-w-xs"
          aria-label="Owner passcode"
        />
        <Button size="sm" onClick={() => void submit()} disabled={busy || !key.trim()}>
          {busy ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <LockOpen className="mr-2 h-3.5 w-3.5" />
          )}
          Unlock
        </Button>
        {error && <span className="text-sm text-danger">Incorrect passcode.</span>}
      </div>
    </div>
  );
}

function AboutSection() {
  const rows: { label: string; value: string }[] = [
    { label: "Agents", value: "Economic · Environment · Social · Risk" },
    { label: "Quant model", value: "Calibrated EV / transport diffusion (causal + scenario)" },
    { label: "Evidence", value: "World Bank indicators + per-state seed covariates" },
    { label: "Stack", value: "FastAPI · SQLite · Groq · TanStack Start" },
  ];
  return (
    <dl className="divide-y divide-border/60">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="label-eyebrow shrink-0">{r.label}</dt>
          <dd className="text-right text-sm text-foreground">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SettingsView({
  adminConfigured,
  adminUnlocked,
  onUnlock,
  onLock,
}: {
  adminConfigured: boolean;
  adminUnlocked: boolean;
  onUnlock: (key: string) => Promise<boolean>;
  onLock: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SettingsIcon className="h-5 w-5" />
        </span>
        <div>
          <div className="label-eyebrow">Settings</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Preferences</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connection, appearance and what powers POLARIS under the hood.
          </p>
        </div>
      </header>

      <SectionCard
        eyebrow="Connection"
        title="Analysis server"
        description="POLARIS talks to a FastAPI backend for parsing, modeling and agent analysis."
      >
        <ConnectionSection />
      </SectionCard>

      <SectionCard
        eyebrow="LLM access"
        title="Groq API key"
        description="Use your own Groq key so analyses run on your quota. Stored on this device only."
      >
        <ApiKeySection />
      </SectionCard>

      <SectionCard
        eyebrow="Owner access"
        title="Reports visibility"
        description="Reports holds every analysis anyone runs. Gate it so only you can see the history after deployment."
      >
        <OwnerAccessSection
          configured={adminConfigured}
          unlocked={adminUnlocked}
          onUnlock={onUnlock}
          onLock={onLock}
        />
      </SectionCard>

      <SectionCard
        eyebrow="Appearance"
        title="Theme"
        description="Choose a palette. Your choice is saved on this device."
      >
        <AppearanceSection />
      </SectionCard>

      <SectionCard eyebrow="About" title="What powers POLARIS">
        <AboutSection />
      </SectionCard>
    </div>
  );
}

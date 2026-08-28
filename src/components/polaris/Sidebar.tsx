import { Bot, FileText, GitCompareArrows, LayoutDashboard, LineChart, Network, Settings } from "lucide-react";
import { toast } from "sonner";

export type ViewId = "dashboard" | "model" | "agents" | "network" | "compare" | "reports" | "settings";

const NAV: { label: string; icon: typeof LayoutDashboard; view?: ViewId }[] = [
  { label: "Dashboard", icon: LayoutDashboard, view: "dashboard" },
  { label: "Model & Impact", icon: LineChart, view: "model" },
  { label: "Agents", icon: Bot, view: "agents" },
  { label: "Resource Network", icon: Network, view: "network" },
  { label: "A/B Compare", icon: GitCompareArrows, view: "compare" },
  { label: "Reports", icon: FileText, view: "reports" },
  { label: "Settings", icon: Settings, view: "settings" },
];

export function Sidebar({
  active,
  onNavigate,
  showReports = true,
}: {
  active: ViewId;
  onNavigate: (view: ViewId) => void;
  showReports?: boolean;
}) {
  const items = showReports ? NAV : NAV.filter((n) => n.view !== "reports");
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
      <div className="px-2">
        <div className="text-xl font-bold tracking-[0.22em] text-sidebar-foreground">POLARIS</div>
        <p className="mt-1 text-xs text-muted-foreground">AI Policy Intelligence Studio</p>
      </div>

      <nav className="mt-8 flex flex-col gap-1">
        {items.map(({ label, icon: Icon, view }) => {
          const enabled = Boolean(view);
          const isActive = enabled && view === active;
          return (
            <button
              key={label}
              type="button"
              disabled={!enabled}
              onClick={() => {
                if (view) onNavigate(view);
                else toast(`${label} — coming soon`);
              }}
              className={
                isActive
                  ? "flex items-center gap-3 rounded-xl bg-sidebar-accent px-3 py-2.5 text-sm font-medium text-sidebar-primary"
                  : enabled
                    ? "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60"
                    : "flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground/60"
              }
            >
              <Icon className="h-4 w-4" />
              {label}
              {!enabled && <span className="ml-auto text-[10px] uppercase tracking-wide">soon</span>}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-sidebar-border px-3 py-3 text-xs text-muted-foreground">
        Four specialist agents analyze economic, environmental, social and risk impact of Indian
        public policy.
      </div>
    </aside>
  );
}

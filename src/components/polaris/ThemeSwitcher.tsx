import { Check, Palette } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  applyTheme,
  readSavedTheme,
  saveTheme,
  THEMES,
  type ThemeDef,
  type ThemeId,
} from "@/lib/theme";

export function ThemeSwitcher() {
  const [active, setActive] = useState<ThemeId>("paper");

  // Restore the saved theme on mount (client-only — avoids SSR mismatch).
  useEffect(() => {
    const theme = readSavedTheme();
    applyTheme(theme);
    setActive(theme.id);
  }, []);

  const select = (theme: ThemeDef) => {
    applyTheme(theme);
    saveTheme(theme);
    setActive(theme.id);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Palette className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="label-eyebrow">Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onSelect={() => select(t)}
            className="flex items-center gap-3"
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ring-black/10"
              style={{ background: t.swatch[0] }}
              aria-hidden
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.swatch[1] }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{t.label}</span>
              <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
            </span>
            {active === t.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

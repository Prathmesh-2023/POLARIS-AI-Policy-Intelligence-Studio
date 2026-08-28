export type ThemeId = "paper" | "sand" | "graphite" | "midnight";

export type ThemeDef = {
  id: ThemeId;
  label: string;
  hint: string;
  /** value written to <html data-theme>; null clears it (uses :root defaults) */
  data: string | null;
  /** whether the `.dark` class is applied (drives the two `dark:` utilities) */
  dark: boolean;
  /** decorative swatch [canvas, accent] for previews */
  swatch: [string, string];
};

export const THEMES: ThemeDef[] = [
  { id: "paper", label: "Indigo Paper", hint: "Light · default", data: null, dark: false, swatch: ["#f6f6fb", "#5b5bd6"] },
  { id: "sand", label: "Warm Sand", hint: "Light · editorial", data: "sand", dark: false, swatch: ["#f6f2ea", "#b5652f"] },
  { id: "graphite", label: "Graphite", hint: "Dark · slate", data: null, dark: true, swatch: ["#20232e", "#8f8ff0"] },
  { id: "midnight", label: "Midnight", hint: "Dark · teal", data: "midnight", dark: true, swatch: ["#0e131c", "#3fc9d6"] },
];

export const THEME_STORAGE_KEY = "polaris-theme";

/** Mutate <html> to reflect the chosen theme (data-theme attr + .dark class). */
export function applyTheme(theme: ThemeDef): void {
  const root = document.documentElement;
  if (theme.data) root.setAttribute("data-theme", theme.data);
  else root.removeAttribute("data-theme");
  root.classList.toggle("dark", theme.dark);
}

/** The saved theme (client-only), falling back to the first (Indigo Paper). */
export function readSavedTheme(): ThemeDef {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    saved = null;
  }
  return THEMES.find((t) => t.id === saved) ?? THEMES[0]!;
}

/** Persist the chosen theme id (best-effort; storage may be unavailable). */
export function saveTheme(theme: ThemeDef): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  } catch {
    /* ignore */
  }
}

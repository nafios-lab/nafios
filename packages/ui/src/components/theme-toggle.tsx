import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/use-theme.ts";
import { cn } from "../lib/utils.ts";

export interface ThemeToggleProps {
  /**
   * Extra classes on the floating button. Merged last via `cn`, so a
   * `bottom-*` / `right-*` utility here overrides the default bottom-right
   * placement — use it to clear a corner-pinned widget (e.g. a devtools
   * trigger).
   */
  className?: string;
}

/**
 * Floating light/dark theme toggle. Mount once at the app root; it pins itself
 * to the bottom-right corner and flips {@link useTheme} between explicit
 * `light` and `dark` based on the currently resolved theme (so the first click
 * always moves away from what the user sees, regardless of a `system` default).
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "fixed bottom-6 right-6 z-50 inline-flex size-11 items-center justify-center rounded-full border border-border bg-card text-card-foreground shadow-lg transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      {isDark ? (
        <Sun className="size-5" aria-hidden="true" />
      ) : (
        <Moon className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}

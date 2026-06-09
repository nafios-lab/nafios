import { useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

const COOKIE_NAME = "nafios-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function getCookie(): Theme | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return (match?.[1] as Theme) ?? null;
}

function setCookie(theme: Theme) {
  // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API lacks SSR support; direct cookie is intentional for theme persistence (E2 spec).
  document.cookie = `${COOKIE_NAME}=${theme};path=/;max-age=31536000;SameSite=Lax`;
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

let listeners: Array<() => void> = [];
let currentTheme: Theme = "system";

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): Theme {
  return currentTheme;
}

function getServerSnapshot(): Theme {
  return "dark";
}

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function initTheme() {
  if (typeof window === "undefined") return;
  const stored = getCookie();
  currentTheme = stored ?? "system";
  applyTheme(currentTheme);

  window.matchMedia(MEDIA_QUERY).addEventListener("change", () => {
    if (currentTheme === "system") {
      applyTheme("system");
    }
  });
}

let initialized = false;

export function useTheme() {
  if (!initialized && typeof window !== "undefined") {
    initialized = true;
    initTheme();
  }

  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((next: Theme) => {
    currentTheme = next;
    setCookie(next);
    applyTheme(next);
    emitChange();
  }, []);

  const resolvedTheme: "light" | "dark" = theme === "system" ? getSystemTheme() : theme;

  return { theme, setTheme, resolvedTheme } as const;
}

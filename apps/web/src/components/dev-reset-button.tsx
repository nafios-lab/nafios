/**
 * Floating button to wipe the browser session so the onboarding flow can be
 * retried repeatedly without getting stuck at the post-success entry point.
 * Not part of the product — a session-reset tool for testing.
 *
 * Gated on the `VITE_RESET_SESSION_TOOL` env flag (must be the string "true").
 * When unset/false it renders nothing, so it never ships unless explicitly
 * enabled for a given run or build. The `VITE_` prefix is required for Vite to
 * expose the var to client code via `import.meta.env`.
 */
import { signOutFn } from "../lib/auth-fns";

export function DevResetButton() {
  if (import.meta.env.VITE_RESET_SESSION_TOOL !== "true") return null;

  async function handleReset() {
    try {
      // 1. Clear the Supabase session cookies on the server.
      await signOutFn();
    } catch {
      // Ignore — proceed with the client-side wipe regardless.
    }

    // 2. Nuke any client-side persisted state (Supabase tokens, app cache).
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Storage may be unavailable; ignore.
    }

    // 3. Hard navigate to the entry point for a fully clean slate.
    window.location.href = "/auth/login";
  }

  return (
    <button
      type="button"
      onClick={handleReset}
      title="DEV ONLY: clear session + storage and return to login"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 2147483647,
        padding: "8px 14px",
        borderRadius: 9999,
        border: "1px solid rgba(255,255,255,0.2)",
        background: "#dc2626",
        color: "#fff",
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "system-ui, sans-serif",
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
      }}
    >
      ⟳ Reset session
    </button>
  );
}

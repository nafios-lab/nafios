/**
 * TEMP / DEV-ONLY. Floating button to wipe the browser session so the onboarding
 * flow can be retried repeatedly without getting stuck at the post-success entry
 * point. Not part of the product — safe to delete once the flow is stable.
 *
 * Only renders in dev (`import.meta.env.DEV`), so it never ships to staging/prod.
 */
import { signOutFn } from "../lib/auth-fns";

export function DevResetButton() {
  if (!import.meta.env.DEV) return null;

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

import { useNavigate } from "@tanstack/react-router";
import { signOutFn } from "../lib/auth-fns";

export function Navbar({ email }: { email: string | undefined }) {
  const navigate = useNavigate();

  async function handleLogout() {
    await signOutFn();
    navigate({ to: "/auth/login" });
  }

  return (
    <nav className="flex items-center justify-between border-b border-border px-6 py-3">
      <span className="text-lg font-semibold tracking-tight">NafiOS</span>
      <div className="flex items-center gap-4">
        {email && <span className="text-sm text-muted-foreground">{email}</span>}
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}

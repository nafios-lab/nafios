import { Logo } from "@nafios/ui/components/logo";
import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "~/features/auth/components/login-form";

interface LoginSearch {
  /** Where to send the user after login — set when a protected route bounced
   *  them here. Sanitized to an internal path to prevent open redirects. */
  redirect?: string;
}

export const Route = createFileRoute("/auth/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const raw = search.redirect;
    // Only accept internal, absolute paths ("/foo"); reject anything else,
    // including protocol-relative "//evil.com" open-redirect attempts.
    const redirect =
      typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : undefined;
    return { redirect };
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();

  return (
    <div className="flex h-screen w-full flex-col gap-0">
      <div
        id="page-header"
        className="flex h-[70px] w-full flex-row items-center justify-start px-6"
      >
        <Logo variant="word" />
      </div>

      <div id="form-container" className="flex h-full flex-row items-center justify-center">
        {/* Login Form Component */}
        <LoginForm redirectTo={redirect} />
      </div>
    </div>
  );
}

import { Logo } from "@nafios/ui/components/logo";
import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "~/features/auth/components/login-form";

export const Route = createFileRoute("/auth/login")({
  component: LoginPage,
});

function LoginPage() {
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
        <LoginForm />
      </div>
    </div>
  );
}

import { Button } from "@nafios/ui/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useSignOut } from "../hooks/use-sign-out";

/**
 * Signs the user out and returns them to the login page. The session is cleared
 * client-side (see {@link useSignOut}); navigating re-runs the destination's
 * guard against the now-empty session.
 */
export function SignOutButton() {
  const navigate = useNavigate();
  const { signOut, isLoading } = useSignOut({
    onSuccess: () => navigate({ to: "/auth/login" }),
  });

  return (
    <Button
      variant="secondary"
      iconLeft={<LogOut />}
      showLoader={isLoading}
      disabled={isLoading}
      onClick={() => signOut()}
    >
      Log out
    </Button>
  );
}

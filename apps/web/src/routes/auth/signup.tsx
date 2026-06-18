import { Logo } from "@nafios/ui/components/logo";
import { Text } from "@nafios/ui/components/typography/text";
import { Button } from "@nafios/ui/components/ui/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SignupWizard } from "../../features/auth/components/signup-wizard";

export const Route = createFileRoute("/auth/signup")({
  component: SignupPage,
});

function SignupPage() {
  return (
    <div className="flex h-screen w-full flex-col gap-0">
      <div
        id="page-header"
        className="flex h-[70px] w-full flex-row items-center justify-start px-6"
      >
        <Logo variant="word" />
      </div>

      <div id="form-container" className="flex h-full flex-col items-center justify-center">
        <SignupWizard />

        <div className="flex flex-row items-center gap-2 justify-center mt-8">
          <Text>Already have an account ?</Text>
          <Link to="/auth/login">
            <Button variant="link" className="p-0" iconRight={<ArrowRight />}>
              Sign in
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

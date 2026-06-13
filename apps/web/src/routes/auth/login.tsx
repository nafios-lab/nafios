import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/login")({
  component: LoginPage,
});

function LoginPage() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <Heading size={"2xl"} as="h1">
          Sign in to nafios
        </Heading>

        <Text variant={"default"} muted>
          Login form will be implemented in D2.
        </Text>
      </div>
    </div>
  );
}

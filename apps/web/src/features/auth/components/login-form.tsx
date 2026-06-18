import { CredentialInput } from "@nafios/ui/components/credential-input";
import { TextInput } from "@nafios/ui/components/text-input";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { Alert, AlertDescription } from "@nafios/ui/components/ui/alert";
import { Button } from "@nafios/ui/components/ui/button";
import { Checkbox } from "@nafios/ui/components/ui/checkbox";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CircleAlert, Mail as EmailIcon, LockIcon as PasswordIcon } from "lucide-react";
import { useState } from "react";
import { useSignIn } from "../hooks/use-sign-in";
import { loginSchema } from "../schemas/login-schema";

interface LoginFormProps {
  /** Where to land after a successful sign-in. Defaults to `/` (which routes on
   *  to the dashboard or back into onboarding). Used for redirect-back when the
   *  user was bounced here from a protected route. */
  redirectTo?: string;
}

export function LoginForm({ redirectTo = "/" }: LoginFormProps) {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);

  const { signIn, isLoading, error } = useSignIn({
    // The session cookie is set server-side by signInFn; navigating re-runs the
    // target's beforeLoad, which now sees the session and lets the user through.
    onSuccess: () => navigate({ to: redirectTo }),
  });

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
    validators: {
      onSubmit: loginSchema,
      onChange: loginSchema,
    },
    onSubmit: async ({ value }) => {
      await signIn({ email: value.email, password: value.password });
    },
  });

  const handleSubmit = () => {
    setSubmitted(true);
    form.handleSubmit();
  };

  // Wrong credentials are shown verbatim; a system fault gets a calm, generic
  // retry message rather than a raw Supabase/network string.
  const formError = error
    ? error.kind === "user"
      ? error.message
      : "Something went wrong. Please try again."
    : null;

  return (
    <div className="flex flex-col min-w-[400px]">
      <div id="login-form-header" className="flex flex-col">
        <Heading>Welcome back.</Heading>
        <Text size={"sm"} muted>
          Sign in to pick up where you left off
        </Text>
      </div>

      <form
        id="login-form"
        className="flex flex-col py-4 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit();
        }}
      >
        <form.Field name="email">
          {(field) => (
            <TextInput
              name={field.name}
              type="email"
              autoComplete="email"
              value={field.state.value}
              placeholder="Email address"
              iconLeft={<EmailIcon />}
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <CredentialInput
              name={field.name}
              autoComplete="current-password"
              value={field.state.value}
              placeholder="password"
              iconLeft={<PasswordIcon />}
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>

        <div className="flex flex-row items-center justify-between">
          <form.Field name="rememberMe">
            {(field) => (
              <Checkbox
                label="Remember Me"
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked === true)}
              />
            )}
          </form.Field>
          {/* Wired to /auth/forgot-password in D3 (route not built yet). */}
          <Button variant={"link"} type="button">
            Forgot Password ?
          </Button>
        </div>

        {formError ? (
          <Alert variant="error">
            <CircleAlert />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <Button variant="brand" type="submit" iconRight={<ArrowRight />} disabled={isLoading}>
          {isLoading ? "Signing in..." : "Login"}
        </Button>
      </form>

      <div className="flex items-center gap-4 my-5">
        <div className="h-px flex-1 bg-linear-to-r from-transparent to-neutral-600" />
        <Text variant={"caption"} className="tracking-[0.2em]">
          New to Nafios
        </Text>
        <div className="h-px flex-1 bg-linear-to-l from-transparent to-neutral-600" />
      </div>

      <div className="flex flex-row items-center gap-2 justify-center">
        <Text>Don't have an account ? </Text>
        <Link to="/auth/signup">
          <Button variant={"link"} className="p-0" iconRight={<ArrowRight />}>
            Create one
          </Button>
        </Link>
      </div>
    </div>
  );
}

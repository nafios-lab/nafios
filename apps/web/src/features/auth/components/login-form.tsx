import { CredentialInput } from "@nafios/ui/components/credential-input";
import { TextInput } from "@nafios/ui/components/text-input";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { Button } from "@nafios/ui/components/ui/button";
import { Checkbox } from "@nafios/ui/components/ui/checkbox";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { ArrowRight, LockIcon as PasswordIcon, User as UsernameIcon } from "lucide-react";
import { loginSchema } from "../schemas/login-schema";

export function LoginForm() {
  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
    },
    validators: {
      onBlur: loginSchema,
    },
    onSubmit: async ({ value }) => {
      // TODO: call auth server function
      console.log("login submit", value);
    },
  });

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
          form.handleSubmit();
        }}
      >
        <form.Field name="username">
          {(field) => (
            <TextInput
              name={field.name}
              value={field.state.value}
              placeholder="username"
              iconLeft={<UsernameIcon />}
              error={field.state.meta.errors?.[0]?.message}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>

        <form.Field name="password">
          {(field) => (
            <CredentialInput
              name={field.name}
              value={field.state.value}
              placeholder="password"
              iconLeft={<PasswordIcon />}
              error={field.state.meta.errors?.[0]?.message}
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
          <Button variant={"link"} type="button">
            Forgot Password ?
          </Button>
        </div>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              variant="brand"
              type="submit"
              iconRight={<ArrowRight />}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in..." : "Login"}
            </Button>
          )}
        </form.Subscribe>
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

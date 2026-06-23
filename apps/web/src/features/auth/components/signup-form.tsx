import { CredentialInput } from "@nafios/ui/components/credential-input";
import { TextInput } from "@nafios/ui/components/text-input";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@nafios/ui/components/ui/alert";
import { Button } from "@nafios/ui/components/ui/button";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { AlertCircle, Mail } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { useAccountSignup } from "../hooks/use-account-signup";
import { accountSignupSchema } from "../schemas/signup-schema";

export function SignupForm() {
  const nav = useNavigate();
  const { isLoading, signupUser, error } = useAccountSignup({
    onSuccess: (_user) => {
      /**
       * At this point, supabase auto cache user session into browser,
       * then navigation user to onboarding
       */
      nav({ to: "/" });
    },
  });

  const formObj = useForm({
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: accountSignupSchema,
      onChange: accountSignupSchema,
    },
    onSubmit: ({ value }) => {
      signupUser({ email: value.email, password: value.password });
    },
  });

  const [attemptSubmit, setAttemptSubmit] = useState<boolean>(false);

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAttemptSubmit(true);
    formObj.handleSubmit();
  };

  const showFormError = Boolean(!isLoading && error !== null);

  return (
    <div className="flex flex-col gap-6 min-w-[400px] max-w-[480px] w-full">
      <div className="flex flex-col">
        <Heading>Create your account.</Heading>
        <Text size="sm" muted>
          Get started with NafiOS
        </Text>
      </div>

      <form
        className={`flex flex-col gap-3 ${isLoading && "pointer-events-none"}`}
        onSubmit={handleSubmit}
      >
        <formObj.Field name="email">
          {(field) => (
            <TextInput
              name={field.name}
              type="email"
              autoComplete="off"
              value={field.state.value}
              placeholder="Email"
              iconLeft={<Mail />}
              error={
                attemptSubmit
                  ? field.state.meta.errors?.[0]?.message
                  : undefined
              }
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </formObj.Field>

        <formObj.Field name="password">
          {(field) => (
            <CredentialInput
              placeholder="Password"
              autoComplete="new-password"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              error={
                attemptSubmit
                  ? field.state.meta.errors?.[0]?.message
                  : undefined
              }
            />
          )}
        </formObj.Field>
        <formObj.Field name="confirmPassword">
          {(field) => (
            <CredentialInput
              placeholder="Confirm Password"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              error={
                attemptSubmit
                  ? field.state.meta.errors?.[0]?.message
                  : undefined
              }
            />
          )}
        </formObj.Field>
        <Button type="submit" variant={"brand"} showLoader={isLoading}>
          Sign up
        </Button>

        {showFormError && (
          <Alert variant="error">
            <AlertCircle />
            <AlertTitle>Sign up failed !</AlertTitle>
            <AlertDescription>{error?.message}</AlertDescription>
          </Alert>
        )}
      </form>
    </div>
  );
}

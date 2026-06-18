import { CredentialInput } from "@nafios/ui/components/credential-input";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { Button } from "@nafios/ui/components/ui/button";
import { useForm } from "@tanstack/react-form";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useSignupWizard } from "../hooks/use-signup-wizard";
import { securityStepSchema } from "../schemas/signup-schema";

export function SignupStepSecurity() {
  const { data, setStepData, next, back } = useSignupWizard();

  const form = useForm({
    defaultValues: {
      password: data.security?.password ?? "",
      confirmPassword: data.security?.confirmPassword ?? "",
    },
    validators: {
      onSubmit: securityStepSchema,
      onChange: securityStepSchema,
    },
    onSubmit: ({ value }) => {
      setStepData("security", value);
      next();
    },
  });

  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    setSubmitted(true);
    form.handleSubmit();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <Heading>Set your security PIN.</Heading>
        <Text size="sm" muted>
          A 6-digit PIN to secure sensitive actions
        </Text>
      </div>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit();
        }}
      >
        <form.Field name="password">
          {(field) => (
            <CredentialInput
              placeholder="Password"
              autoComplete="new-password"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
            />
          )}
        </form.Field>

        <form.Field name="confirmPassword">
          {(field) => (
            <CredentialInput
              placeholder="Confirm Password"
              autoComplete="new-password"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
            />
          )}
        </form.Field>

        <div className="flex gap-3 mt-2">
          <Button
            variant="outline"
            type="button"
            iconLeft={<ArrowLeft />}
            onClick={back}
            className="flex-1"
          >
            Back
          </Button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                variant="brand"
                type="submit"
                iconRight={<ArrowRight />}
                disabled={isSubmitting}
                className="flex-1"
              >
                Continue
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </div>
  );
}

import { TextInput } from "@nafios/ui/components/text-input";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { Button } from "@nafios/ui/components/ui/button";
import { MaskInput } from "@nafios/ui/components/ui/masked-input";
import { useForm } from "@tanstack/react-form";
import { ArrowRight, Mail, Phone, User } from "lucide-react";
import { useState } from "react";
import { useSignupWizard } from "../hooks/use-signup-wizard";
import { accountStepSchema } from "../schemas/signup-schema";

export function SignupStepAccount() {
  const { data, setStepData, next } = useSignupWizard();

  const form = useForm({
    defaultValues: {
      username: data.account?.username ?? "",
      email: data.account?.email ?? "",
      mobile: data.account?.mobile ?? "",
    },
    validators: {
      onSubmit: accountStepSchema,
      onChange: accountStepSchema,
    },
    onSubmit: ({ value }) => {
      setStepData("account", value);
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
        <Heading>Create your account.</Heading>
        <Text size="sm" muted>
          Get started with NafiOS
        </Text>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
      >
        <form.Field name="username">
          {(field) => (
            <TextInput
              name={field.name}
              type="text"
              autoComplete="off"
              value={field.state.value}
              placeholder="Username"
              iconLeft={<User />}
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <TextInput
              name={field.name}
              type="email"
              autoComplete="off"
              value={field.state.value}
              placeholder="Email address"
              iconLeft={<Mail />}
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>

        <form.Field name="mobile">
          {(field) => (
            <MaskInput
              name={field.name}
              type="text"
              value={field.state.value}
              iconLeft={<Phone />}
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
              mask="(+65) 9999 9999"
              placeholder="(+65) 9000 0000"
              onValueChange={(v) => field.handleChange(v)}
              onBlur={field.handleBlur}
              autoComplete="off"
            />
          )}
        </form.Field>

        <Button variant="brand" type="submit" iconRight={<ArrowRight />} className="mt-2">
          Continue
        </Button>
      </form>
    </div>
  );
}

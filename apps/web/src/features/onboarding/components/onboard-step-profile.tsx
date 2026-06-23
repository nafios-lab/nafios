"use client";
import { AvatarUpload } from "@nafios/ui/components/avatar-upload";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { Alert, AlertDescription, AlertTitle } from "@nafios/ui/components/ui/alert";
import { Button } from "@nafios/ui/components/ui/button";
import { MaskInput } from "@nafios/ui/components/ui/masked-input";
import { useForm } from "@tanstack/react-form";
import { AlertCircle, ArrowRight, Phone } from "lucide-react";
import { type SubmitEvent, useRef, useState } from "react";
import { type ProfileValues, profileSchema } from "~/features/auth/schemas/onboarding-schema";
import { useOnboardingWizard } from "../context/onboarding-wizard-provider";
import { useOnboardingProfile } from "../hooks/use-onboarding-profile";

/**
 * Onboarding Step 2 — Profile. Both fields (avatar + mobile) are optional.
 *
 * - **Save** persists whatever is filled (avatar → Storage, mobile →
 *   user_metadata; each skipped if empty) and advances to Family.
 * - **Skip** advances to Family with no write.
 * - On **back-navigation** into this step, the form auto-populates from the last
 *   submitted values held in wizard state (both avatar preview and mobile).
 */
export function OnboardStepProfile() {
  const { getData, setData, next } = useOnboardingWizard();

  const saved = getData("profile");

  // Avatar is a non-text, fully-controlled field → local state (seeded from
  // wizard state so back-navigation restores the preview).
  const [avatar, setAvatar] = useState<string | undefined>(saved?.avatar);
  const [attemptSubmit, setAttemptSubmit] = useState(false);

  // The values just sent to the server, so onSuccess can commit them to wizard
  // state only after the write actually succeeds.
  const submittedRef = useRef<ProfileValues>({ avatar: saved?.avatar, phone: saved?.phone ?? "" });

  const { saveProfile, isSaving, error } = useOnboardingProfile({
    onSuccess: () => {
      setData("profile", submittedRef.current);
      next();
    },
  });

  const form = useForm({
    defaultValues: { phone: saved?.phone ?? "" },
    validators: { onChange: profileSchema, onSubmit: profileSchema },
    onSubmit: ({ value }) => {
      submittedRef.current = { avatar, phone: value.phone };
      saveProfile({
        avatar, // data URL, or already-stored path, or undefined — server decides
        mobile: value.phone || undefined, // empty string → skip the metadata write
      });
    },
  });

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAttemptSubmit(true);
    form.handleSubmit();
  };

  const handleSkip = () => {
    if (isSaving) return;
    next();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <Heading>Set up your profile</Heading>
        <Text size="sm" muted>
          Add a photo and mobile number — both optional. You can skip and do this later.
        </Text>
      </div>

      {error && (
        <Alert variant="error">
          <AlertCircle />
          <AlertTitle>Couldn't save your profile</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form
        className={`flex flex-col gap-5 ${isSaving ? "pointer-events-none" : ""}`}
        onSubmit={handleSubmit}
      >
        <AvatarUpload value={avatar} onChange={setAvatar} optional disabled={isSaving} />

        <form.Field name="phone">
          {(field) => (
            <MaskInput
              name={field.name}
              type="text"
              value={field.state.value}
              iconLeft={<Phone />}
              mask="(+65) 9999 9999"
              placeholder="(+65) 9000 0000"
              error={attemptSubmit ? field.state.meta.errors?.[0]?.message : undefined}
              onValueChange={(v) => field.handleChange(v)}
              onBlur={field.handleBlur}
              autoComplete="off"
              disabled={isSaving}
            />
          )}
        </form.Field>

        <div className="flex flex-row items-center justify-between gap-3 mt-2">
          <Button type="button" variant="ghost" onClick={handleSkip} disabled={isSaving}>
            Skip for now
          </Button>
          <Button
            type="submit"
            variant="brand"
            iconRight={<ArrowRight />}
            showLoader={isSaving}
            textOnLoading="Saving…"
          >
            Save and continue
          </Button>
        </div>
      </form>
    </div>
  );
}

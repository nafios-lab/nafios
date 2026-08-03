import { AvatarUpload } from "@nafios/ui/components/avatar-upload";
import { DobInput } from "@nafios/ui/components/dob-input";
import { SelectField } from "@nafios/ui/components/select-field";
import { TextInput } from "@nafios/ui/components/text-input";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Button } from "@nafios/ui/components/ui/button";
import { Card } from "@nafios/ui/components/ui/card";
import { MaskInput } from "@nafios/ui/components/ui/masked-input";
import { useForm } from "@tanstack/react-form";
import { Phone } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { dobDisplayToIso, dobIsoToDisplay, type FamilyListEntry } from "../lib/family-helpers";
import {
  type FamilyMemberValues,
  familyMemberFormSchema,
  RELATIONSHIP_OPTIONS,
} from "../schemas/onboarding-schema";

export interface FamilyMemberFormProps {
  /** When present, the form opens in **edit** mode seeded from this entry. */
  initialValue?: FamilyListEntry;
  /** Receives the cleaned, spec-shaped member; the parent owns the `clientKey`. */
  onSubmit: (member: FamilyMemberValues) => void;
  onCancel: () => void;
}

/**
 * Inline add/edit form for a single family member — the expanding panel below
 * the member list. Mirrors the Profile step: a controlled avatar in local state,
 * submit-gated validation (errors appear only after the first failed submit and
 * clear in real time), and a primary button disabled until the two required
 * fields are present. Optional fields are cleaned to `undefined` on commit;
 * `clientKey` is assigned by the parent, not here.
 */
export function FamilyMemberForm({ initialValue, onSubmit, onCancel }: FamilyMemberFormProps) {
  const isEdit = Boolean(initialValue);

  // Avatar is a non-text, fully-controlled field → local state (mirrors Profile).
  const [avatar, setAvatar] = useState<string | undefined>(initialValue?.avatar);
  const [attemptSubmit, setAttemptSubmit] = useState(false);

  const form = useForm({
    defaultValues: {
      name: initialValue?.name ?? "",
      relationship: (initialValue?.relationship ?? "") as string,
      nric: initialValue?.nric ?? "",
      mobileNo: initialValue?.mobileNo ?? "",
      dateOfBirth: dobIsoToDisplay(initialValue?.dateOfBirth),
    },
    validators: { onChange: familyMemberFormSchema, onSubmit: familyMemberFormSchema },
    onSubmit: ({ value }) => {
      const nric = value.nric.trim();
      const mobileNo = value.mobileNo.trim();
      onSubmit({
        name: value.name.trim(),
        relationship: value.relationship as FamilyMemberValues["relationship"],
        avatar,
        nric: nric ? nric.toUpperCase() : undefined,
        mobileNo: mobileNo || undefined,
        dateOfBirth: dobDisplayToIso(value.dateOfBirth),
      });
    },
  });

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setAttemptSubmit(true);
    form.handleSubmit();
  };

  return (
    <Card className="flex flex-col gap-5 p-5">
      <Heading as="h3" size="sm">
        {isEdit ? "Edit family member" : "Add family member"}
      </Heading>

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <AvatarUpload value={avatar} onChange={setAvatar} optional />

        <form.Field name="name">
          {(field) => (
            <TextInput
              name={field.name}
              label="Name"
              placeholder="Full name"
              value={field.state.value}
              error={attemptSubmit ? field.state.meta.errors?.[0]?.message : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              autoComplete="off"
            />
          )}
        </form.Field>

        <form.Field name="relationship">
          {(field) => (
            <SelectField
              label="Relationship"
              placeholder="Select relationship"
              options={RELATIONSHIP_OPTIONS}
              value={field.state.value}
              error={attemptSubmit ? field.state.meta.errors?.[0]?.message : undefined}
              onValueChange={(v) => field.handleChange(v)}
            />
          )}
        </form.Field>

        <form.Field name="nric">
          {(field) => (
            <TextInput
              name={field.name}
              label="NRIC"
              placeholder="S1234567A"
              helperText="e.g. S1234567A — kept encrypted at rest"
              value={field.state.value}
              error={attemptSubmit ? field.state.meta.errors?.[0]?.message : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              autoComplete="off"
            />
          )}
        </form.Field>

        <form.Field name="mobileNo">
          {(field) => (
            <MaskInput
              name={field.name}
              type="text"
              label="Mobile"
              value={field.state.value}
              iconLeft={<Phone />}
              mask="(+65) 9999 9999"
              placeholder="(+65) 9000 0000"
              error={attemptSubmit ? field.state.meta.errors?.[0]?.message : undefined}
              onValueChange={(v) => field.handleChange(v)}
              onBlur={field.handleBlur}
              autoComplete="off"
            />
          )}
        </form.Field>

        <form.Field name="dateOfBirth">
          {(field) => (
            <DobInput
              name={field.name}
              label="Date of birth"
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>

        <div className="mt-1 flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <form.Subscribe
            selector={(s) => ({ name: s.values.name, relationship: s.values.relationship })}
          >
            {({ name, relationship }) => (
              <Button type="submit" variant="brand" disabled={!name.trim() || !relationship}>
                {isEdit ? "Save changes" : "Add member"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </Card>
  );
}

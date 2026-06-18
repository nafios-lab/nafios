import { AvatarUpload } from "@nafios/ui/components/avatar-upload";
import { DobInput } from "@nafios/ui/components/dob-input";
import { SelectField } from "@nafios/ui/components/select-field";
import { TextInput } from "@nafios/ui/components/text-input";
import { Text } from "@nafios/ui/components/typography/text";
import { Button } from "@nafios/ui/components/ui/button";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { type FamilyMemberValues, familyMemberFormSchema } from "../schemas/signup-schema";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "";
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

const RELATIONSHIP_OPTIONS = [
  { value: "spouse", label: "Spouse" },
  { value: "child", label: "Child" },
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];

interface FamilyMemberFormProps {
  defaultValues?: FamilyMemberValues;
  onSubmit: (values: FamilyMemberValues) => void;
  onCancel: () => void;
  title?: string;
  submitLabel?: string;
}

export function FamilyMemberForm({
  defaultValues,
  onSubmit,
  onCancel,
  title = "Add family member",
  submitLabel = "Add member",
}: FamilyMemberFormProps) {
  const form = useForm({
    defaultValues: {
      name: defaultValues?.name ?? "",
      relationship: defaultValues?.relationship ?? "",
      nric: defaultValues?.nric ?? "",
      mobile: defaultValues?.mobile ?? "",
      dateOfBirth: defaultValues?.dateOfBirth ?? "",
    },
    validators: {
      onSubmit: familyMemberFormSchema,
      onChange: familyMemberFormSchema,
    },
    onSubmit: ({ value }) => {
      onSubmit({
        name: value.name.trim(),
        relationship: value.relationship as FamilyMemberValues["relationship"],
        avatar,
        nric: value.nric || undefined,
        mobile: value.mobile || undefined,
        dateOfBirth: value.dateOfBirth || undefined,
      });
    },
  });

  const [submitted, setSubmitted] = useState(false);
  const [avatar, setAvatar] = useState<string | undefined>(defaultValues?.avatar);

  const handleSubmit = () => {
    setSubmitted(true);
    form.handleSubmit();
  };

  return (
    <div className="rounded-xl border border-input p-4 flex flex-col gap-4">
      <Text className="font-semibold">{title}</Text>

      <form.Subscribe selector={(s) => s.values.name}>
        {(name) => (
          <AvatarUpload value={avatar} onChange={setAvatar} fallback={getInitials(name)} optional />
        )}
      </form.Subscribe>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <TextInput
              name={field.name}
              value={field.state.value}
              placeholder="Username"
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>

        <form.Field name="relationship">
          {(field) => (
            <SelectField
              placeholder="Relationship..."
              options={RELATIONSHIP_OPTIONS}
              value={field.state.value}
              onValueChange={(v) => field.handleChange(v)}
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
            />
          )}
        </form.Field>

        <form.Field name="nric">
          {(field) => (
            <TextInput
              name={field.name}
              value={field.state.value}
              placeholder="NRIC (optional)"
              helperText="e.g. S1234567A — kept encrypted at rest"
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>

        <form.Field name="mobile">
          {(field) => (
            <TextInput
              name={field.name}
              value={field.state.value}
              placeholder="Mobile number (optional)"
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>

        <form.Field name="dateOfBirth">
          {(field) => (
            <DobInput
              name={field.name}
              value={field.state.value}
              placeholder="Date of birth (optional)"
              error={submitted ? field.state.meta.errors?.[0]?.message : undefined}
              onValueChange={(v) => field.handleChange(v)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>

        <div className="flex gap-3 mt-1">
          <Button variant="outline" type="button" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <form.Subscribe
            selector={(s) => ({
              name: s.values.name,
              relationship: s.values.relationship,
              isSubmitting: s.isSubmitting,
            })}
          >
            {({ name, relationship, isSubmitting }) => (
              <Button
                variant="brand"
                type="submit"
                disabled={!name.trim() || !relationship || isSubmitting}
                className="flex-1"
              >
                {submitLabel}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </div>
  );
}

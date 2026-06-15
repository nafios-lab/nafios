import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { Avatar, AvatarFallback, AvatarImage } from "@nafios/ui/components/ui/avatar";
import { Button } from "@nafios/ui/components/ui/button";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import type { StepIndex } from "../context/signup-wizard";
import { useSignupWizard } from "../hooks/use-signup-wizard";

const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: "Spouse",
  child: "Child",
  parent: "Parent",
  sibling: "Sibling",
  other: "Other",
};

export function SignupStepReview() {
  const { data, back, goTo, isSubmitting, setIsSubmitting } = useSignupWizard();

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      // TODO: call signup server function with data
      console.log("signup submit", data);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <Heading>Review your details.</Heading>
        <Text size="sm" muted>
          Make sure everything looks right before creating your account
        </Text>
      </div>

      <div className="flex flex-col gap-4">
        <ReviewSection title="Account" onEdit={() => goTo(0 as StepIndex)}>
          <ReviewRow label="Email" value={data.account?.email} />
          <ReviewRow label="Password" value="••••••••" />
        </ReviewSection>

        <ReviewSection title="Security" onEdit={() => goTo(1 as StepIndex)}>
          <ReviewRow label="Security PIN" value="••••••" />
        </ReviewSection>

        <ReviewSection title="Family" onEdit={() => goTo(2 as StepIndex)}>
          {data.family?.familyMembers?.length ? (
            data.family.familyMembers.map((member, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: display-only list
                key={i}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar size="sm" className="shrink-0">
                    {member.avatar ? <AvatarImage src={member.avatar} alt="" /> : null}
                    <AvatarFallback className="text-[10px] font-semibold">
                      {member.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <Text size="sm" className="truncate">
                    {member.name}
                  </Text>
                </div>
                <Text size="sm" muted>
                  {RELATIONSHIP_LABELS[member.relationship] ?? member.relationship}
                </Text>
              </div>
            ))
          ) : (
            <Text size="sm" muted>
              No family members added
            </Text>
          )}
        </ReviewSection>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" iconLeft={<ArrowLeft />} onClick={back} className="flex-1">
          Back
        </Button>
        <Button
          variant="brand"
          iconRight={<Check />}
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="flex-1"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-input p-4">
      <div className="flex items-center justify-between mb-3">
        <Text size="sm" className="font-semibold uppercase tracking-wider">
          {title}
        </Text>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5 mr-1" />
          Edit
        </Button>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between">
      <Text size="sm" muted>
        {label}
      </Text>
      <Text size="sm">{value ?? "—"}</Text>
    </div>
  );
}

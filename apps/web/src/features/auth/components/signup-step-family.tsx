import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { Button } from "@nafios/ui/components/ui/button";
import { Card } from "@nafios/ui/components/ui/card";
import { ArrowLeft, ArrowRight, HeartHandshakeIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSignupWizard } from "../hooks/use-signup-wizard";
import type { FamilyMemberValues } from "../schemas/signup-schema";
import { FamilyMemberForm } from "./family-member-form";

const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: "SPOUSE",
  child: "CHILD",
  parent: "PARENT",
  sibling: "SIBLING",
  other: "OTHER",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "";
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

function maskNric(nric: string): string {
  if (nric.length <= 5) return nric;
  return nric.slice(0, 5) + "*".repeat(nric.length - 5);
}

type FormMode = { type: "closed" } | { type: "add" } | { type: "edit"; index: number };

export function SignupStepFamily() {
  const { data, setStepData, next, back } = useSignupWizard();

  const [members, setMembers] = useState<FamilyMemberValues[]>(data.family?.familyMembers ?? []);
  const [formMode, setFormMode] = useState<FormMode>({ type: "closed" });

  const hasMembers = members.length > 0;
  const isFormOpen = formMode.type !== "closed";

  function handleAddMember(values: FamilyMemberValues) {
    setMembers((prev) => [...prev, values]);
    setFormMode({ type: "closed" });
  }

  function handleEditMember(values: FamilyMemberValues) {
    if (formMode.type !== "edit") return;
    const { index } = formMode;
    setMembers((prev) => prev.map((m, i) => (i === index ? values : m)));
    setFormMode({ type: "closed" });
  }

  function handleDeleteMember(index: number) {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  }

  function handleContinue() {
    setStepData("family", { familyMembers: members });
    next();
  }

  function handleBack() {
    setStepData("family", { familyMembers: members });
    back();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <Heading>Add family members.</Heading>
        <Text size="sm" muted>
          Link the people you manage with — partners, parents, kids. You can do this later, too.
        </Text>
      </div>

      {/* ── Empty state ── */}
      {!hasMembers && !isFormOpen && (
        <Card className="border border-dashed p-6 flex flex-col items-center justify-center gap-2 bg-transparent">
          <div className="rounded-full h-12 aspect-square bg-brand-darker/20 flex items-center justify-center">
            <HeartHandshakeIcon size={20} className="text-brand" />
          </div>
          <Text className="font-medium">No family members yet</Text>
          <Text size="xs" muted>
            Add up to 10 people to manage them
          </Text>
        </Card>
      )}

      {/* ── Member cards ── */}
      {hasMembers && !isFormOpen && (
        <div className="flex flex-col gap-3">
          {members.map((member, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: no stable ID before persistence
            <div key={index} className="flex items-center gap-3 rounded-xl border border-input p-3">
              <div className="rounded-full size-10 bg-muted flex items-center justify-center shrink-0">
                <Text size="xs" className="font-semibold">
                  {getInitials(member.name)}
                </Text>
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <Text size="sm" className="font-semibold truncate">
                  {member.name}
                </Text>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded">
                    {RELATIONSHIP_LABELS[member.relationship] ?? member.relationship}
                  </span>
                  {member.nric && (
                    <Text size="xs" muted>
                      {maskNric(member.nric)}
                    </Text>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => setFormMode({ type: "edit", index })}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => handleDeleteMember(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit form ── */}
      {formMode.type === "add" && (
        <FamilyMemberForm
          onSubmit={handleAddMember}
          onCancel={() => setFormMode({ type: "closed" })}
        />
      )}
      {formMode.type === "edit" && (
        <FamilyMemberForm
          defaultValues={members[formMode.index]}
          onSubmit={handleEditMember}
          onCancel={() => setFormMode({ type: "closed" })}
          title="Edit family member"
          submitLabel="Save changes"
        />
      )}

      {/* ── Add button (form closed, < 10 members) ── */}
      {!isFormOpen && members.length < 10 && (
        <Button
          variant="outline"
          type="button"
          iconLeft={<Plus />}
          onClick={() => setFormMode({ type: "add" })}
          className={hasMembers ? "border-dashed" : ""}
        >
          {hasMembers ? "Add a family member" : "Add family member"}
        </Button>
      )}

      {/* ── Step navigation ── */}
      {!isFormOpen && (
        <div className="flex gap-3">
          <Button variant="outline" type="button" iconLeft={<ArrowLeft />} onClick={handleBack}>
            Back
          </Button>
          <Button
            variant={hasMembers ? "brand" : "secondary"}
            type="button"
            iconRight={<ArrowRight />}
            onClick={handleContinue}
            className="flex-1"
          >
            {hasMembers ? "Continue" : "Skip for now"}
          </Button>
        </div>
      )}
    </div>
  );
}

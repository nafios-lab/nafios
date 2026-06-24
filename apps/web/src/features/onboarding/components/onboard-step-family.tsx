import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import { Button } from "@nafios/ui/components/ui/button";
import { Card } from "@nafios/ui/components/ui/card";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { useOnboardingWizard } from "../context/onboarding-wizard-provider";
import { type FamilyListEntry, stripClientKey } from "../lib/family-helpers";
import { type FamilyMemberValues, MAX_FAMILY_MEMBERS } from "../schemas/onboarding-schema";
import { FamilyMemberForm } from "./family-member-form";
import { FamilyMemberListItem } from "./family-member-list-item";

/** The inline form is either closed, adding a new member, or editing one by key. */
type FormState = { mode: "closed" } | { mode: "add" } | { mode: "edit"; clientKey: string };

/**
 * Onboarding Step 3, screen 1 — **Family**. Collects 0–10 family members into
 * the wizard's in-session `family` state with **no DB write** (the commit point
 * is the later Review → Confirm). The list lives in local state keyed by a
 * session-only `clientKey`; every mutation mirrors the spec-shaped members
 * (clientKey stripped) into wizard state via `setData`.
 *
 * - **Skip for now** (0 members) / **Continue** (≥1) → Review.
 * - **Back** → Profile.
 * - The footer primary is disabled while the inline form is open, so
 *   in-progress input is never silently dropped.
 */
export function OnboardStepFamily() {
  const { getData, setData, next, back } = useOnboardingWizard();

  // Seed local list from wizard state, giving each member a fresh session-only
  // clientKey. Lazy init runs once per mount; on back-navigation the step
  // remounts and restores from whatever was last committed.
  const [entries, setEntries] = useState<FamilyListEntry[]>(() =>
    (getData("family")?.familyMembers ?? []).map((member) => ({
      clientKey: crypto.randomUUID(),
      ...member,
    })),
  );
  const [formState, setFormState] = useState<FormState>({ mode: "closed" });

  // Single mutation path: update the local list AND mirror the spec-shaped
  // members (clientKey stripped) into wizard state.
  const commit = useCallback(
    (nextEntries: FamilyListEntry[]) => {
      setEntries(nextEntries);
      setData("family", { familyMembers: nextEntries.map(stripClientKey) });
    },
    [setData],
  );

  const closeForm = () => setFormState({ mode: "closed" });

  const handleAdd = (member: FamilyMemberValues) => {
    commit([...entries, { clientKey: crypto.randomUUID(), ...member }]);
    closeForm();
  };

  const handleSave = (clientKey: string, member: FamilyMemberValues) => {
    commit(
      entries.map((entry) => (entry.clientKey === clientKey ? { clientKey, ...member } : entry)),
    );
    closeForm();
  };

  const handleDelete = (clientKey: string) => {
    commit(entries.filter((entry) => entry.clientKey !== clientKey));
  };

  const isEmpty = entries.length === 0;
  const atCap = entries.length >= MAX_FAMILY_MEMBERS;
  const formOpen = formState.mode !== "closed";
  const editingKey = formState.mode === "edit" ? formState.clientKey : undefined;
  const editing = editingKey ? entries.find((entry) => entry.clientKey === editingKey) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <Heading>Add your Family</Heading>
        <Text size="sm" muted>
          Link the people you manage with — partners, parents, kids. You can do it later too.
        </Text>
      </div>

      {isEmpty ? (
        <Card className="flex flex-col items-center gap-1 border-dashed p-8 text-center">
          <Text weight="medium">No family members yet</Text>
          <Text size="sm" muted>
            Add up to 10 people to manage
          </Text>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {/* The member being edited is hidden — its inline form below stands in
              for the card, so the same person never shows twice. */}
          {entries
            .filter((entry) => entry.clientKey !== editingKey)
            .map((entry) => (
              <FamilyMemberListItem
                key={entry.clientKey}
                member={entry}
                disabled={formOpen}
                onEdit={() => setFormState({ mode: "edit", clientKey: entry.clientKey })}
                onDelete={() => handleDelete(entry.clientKey)}
              />
            ))}
        </div>
      )}

      {!formOpen && !atCap && (
        <Button
          type="button"
          variant="outline"
          iconLeft={<Plus />}
          onClick={() => setFormState({ mode: "add" })}
          className=""
        >
          Add a family member
        </Button>
      )}

      {!formOpen && atCap && (
        <Text size="sm" muted>
          You can add up to 10 people.
        </Text>
      )}

      {formOpen && (
        <FamilyMemberForm
          key={formState.mode === "edit" ? formState.clientKey : "add"}
          initialValue={editing}
          onCancel={closeForm}
          onSubmit={(member) =>
            formState.mode === "edit" ? handleSave(formState.clientKey, member) : handleAdd(member)
          }
        />
      )}

      <div className="mt-2 flex flex-row items-center justify-between gap-3">
        <Button type="button" variant="outline" iconLeft={<ArrowLeft />} onClick={back}>
          Back
        </Button>
        <Button
          type="button"
          variant="brand"
          iconRight={<ArrowRight />}
          onClick={next}
          disabled={formOpen}
        >
          {isEmpty ? "Skip for now" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

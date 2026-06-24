import { ConfirmDialog } from "@nafios/ui/components/confirm-dialog";
import { Text } from "@nafios/ui/components/typography/text";
import { Avatar, AvatarFallback, AvatarImage } from "@nafios/ui/components/ui/avatar";
import { Badge } from "@nafios/ui/components/ui/badge";
import { Card } from "@nafios/ui/components/ui/card";
import { IconButton } from "@nafios/ui/components/ui/icon-button";
import { Pencil, Trash2 } from "lucide-react";
import { type FamilyListEntry, initials, maskNric } from "../lib/family-helpers";

export interface FamilyMemberListItemProps {
  member: FamilyListEntry;
  onEdit: () => void;
  onDelete: () => void;
  /** Disables the row's actions (e.g. while the add/edit form is open). */
  disabled?: boolean;
}

/**
 * One member row: avatar (image, else name initials), name + relationship badge,
 * a masked NRIC line when present, and edit/delete actions. Delete is gated by a
 * destructive `ConfirmDialog`.
 */
export function FamilyMemberListItem({
  member,
  onEdit,
  onDelete,
  disabled,
}: FamilyMemberListItemProps) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <Avatar size="default">
        {member.avatar && <AvatarImage src={member.avatar} alt="" />}
        <AvatarFallback>{initials(member.name)}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <Text as="span" size="sm" weight="medium" className="truncate">
            {member.name}
          </Text>
          <Badge variant="secondary" className="uppercase">
            {member.relationship}
          </Badge>
        </div>
        {member.nric && (
          <Text as="span" size="xs" muted>
            {maskNric(member.nric)}
          </Text>
        )}
      </div>

      <div className="flex items-center gap-1">
        <IconButton
          icon={<Pencil />}
          aria-label={`Edit ${member.name}`}
          variant="ghost"
          size="sm"
          onClick={onEdit}
          disabled={disabled}
        />
        <ConfirmDialog
          trigger={
            <IconButton
              icon={<Trash2 />}
              aria-label={`Remove ${member.name}`}
              variant="ghost"
              size="sm"
              disabled={disabled}
            />
          }
          title="Remove family member?"
          description={`${member.name} will be removed from your family list.`}
          confirmLabel="Remove"
          variant="destructive"
          onConfirm={onDelete}
        />
      </div>
    </Card>
  );
}

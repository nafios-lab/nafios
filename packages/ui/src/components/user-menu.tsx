import { LogOut, Settings, User } from "lucide-react";
import { cn } from "../lib/utils.ts";
import { Text } from "./typography/text.tsx";
import { Avatar, AvatarFallback, AvatarImage, type AvatarProps } from "./ui/avatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";

/**
 * Presentation-focused user shape consumed by {@link UserMenu}. Intentionally
 * minimal and decoupled from any auth provider — map your auth user onto this
 * before passing it in.
 */
export interface UserMenuUser {
  /** Display name shown in the header and used to derive the avatar initials. */
  name?: string;
  /** Email shown beneath the name in the header. */
  email?: string;
  /** Avatar image URL. Falls back to initials (or a generic icon) when absent. */
  avatarUrl?: string;
}

export interface UserMenuProps {
  /** The user rendered in the trigger avatar and the menu header. */
  user: UserMenuUser;
  /** Called when the "Profile" item is selected. No-op when omitted. */
  onProfile?: () => void;
  /** Called when the "Settings" item is selected. No-op when omitted. */
  onSettings?: () => void;
  /** Called when the "Logout" item is selected. No-op when omitted. */
  onLogout?: () => void;
  /** Size of the trigger avatar. @default "default" */
  avatarSize?: AvatarProps["size"];
  /** Horizontal alignment of the menu relative to the trigger. @default "end" */
  align?: "start" | "center" | "end";
  /** Which side of the trigger to open on. @default "bottom" */
  side?: "top" | "right" | "bottom" | "left";
  /** Extra class names on the content panel. */
  contentClassName?: string;
  /** Controlled open state. */
  open?: boolean;
  /** Callback when the open state changes. */
  onOpenChange?: (open: boolean) => void;
}

/** Derive up-to-two-character initials from a name, falling back to the email. */
function deriveInitials(user: UserMenuUser): string {
  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    const initials = (first + last).toUpperCase();
    if (initials) return initials;
  }
  const email = user.email?.trim();
  if (email) return email.slice(0, 2).toUpperCase();
  return "";
}

/** Avatar rendering shared by the trigger and the menu header. */
function UserAvatar({ user, size }: { user: UserMenuUser; size?: AvatarProps["size"] }) {
  const initials = deriveInitials(user);
  const label = user.name || user.email || "User";
  return (
    <Avatar size={size}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={label} />}
      <AvatarFallback>
        {initials || <User className="size-1/2" aria-hidden="true" />}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Account dropdown anchored to the user's avatar. Renders the user identity in
 * a header and the standard Profile / Settings / Logout actions. Each action
 * fires its optional callback; an omitted callback simply does nothing.
 */
function UserMenu({
  user,
  onProfile,
  onSettings,
  onLogout,
  avatarSize = "default",
  align = "end",
  side = "bottom",
  contentClassName,
  open,
  onOpenChange,
}: UserMenuProps) {
  const hasIdentity = Boolean(user.name || user.email);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={user.name ? `Open user menu for ${user.name}` : "Open user menu"}
          className="rounded-full outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <UserAvatar user={user} size={avatarSize} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className={cn("min-w-56", contentClassName)}>
        {hasIdentity && (
          <>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <UserAvatar user={user} size="sm" />
              <div className="flex min-w-0 flex-col">
                {user.name && (
                  <Text as="span" variant="label" size="sm" className="truncate">
                    {user.name}
                  </Text>
                )}
                {user.email && (
                  <Text as="span" size="xs" muted className="truncate">
                    {user.email}
                  </Text>
                )}
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem onSelect={() => onProfile?.()}>
          <User aria-hidden="true" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSettings?.()}>
          <Settings aria-hidden="true" />
          <span>Settings</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => onLogout?.()}
          className="text-error-foreground focus:text-error-foreground"
        >
          <LogOut aria-hidden="true" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { UserMenu };

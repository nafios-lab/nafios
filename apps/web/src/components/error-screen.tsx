import { Logo } from "@nafios/ui/components/logo";
import { Heading } from "@nafios/ui/components/typography/heading";
import { Text } from "@nafios/ui/components/typography/text";
import type { ReactNode } from "react";

interface ErrorScreenProps {
  /** Headline shown to the user. */
  title: string;
  /** Supporting copy explaining what happened and what to do next. */
  description: string;
  /** Optional call-to-action (e.g. a retry button or a link home). */
  action?: ReactNode;
}

/**
 * Shell-wide presentation for terminal error states: the navigable `/error`
 * page, the router's global error boundary, and 404s all render through this so
 * they stay visually consistent. Purely presentational — callers own the copy
 * and the action.
 */
export function ErrorScreen({ title, description, action }: ErrorScreenProps) {
  return (
    <div className="flex h-screen w-full flex-col gap-0">
      <div
        id="page-header"
        className="flex h-[70px] w-full flex-row items-center justify-start px-6"
      >
        <Logo variant="word" />
      </div>

      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <Heading>{title}</Heading>
        <Text size="sm" muted className="max-w-md">
          {description}
        </Text>
        {action}
      </div>
    </div>
  );
}

import { useTheme } from "../../hooks/use-theme.ts";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({ ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      richColors
      className="font-body!"
      style={
        {
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "!bg-background !text-foreground !border-border",
          success: "!bg-success !text-success-foreground !border-success-subtle",
          error: "!bg-error !text-error-foreground !border-error-subtle",
          warning: "!bg-warning !text-warning-foreground !border-warning-subtle",
          info: "!bg-info !text-info-foreground !border-info-subtle",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
export { toast } from "sonner";

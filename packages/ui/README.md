# @nafios/ui

Shared UI package for NafiOS — shadcn/ui + Tailwind v4 + NafiOS brand theming.

## Usage

Import the stylesheet in your app root:

```tsx
import "@nafios/ui/globals.css";
```

Use components:

```tsx
import { Button } from "@nafios/ui/components/ui/button";
import { ConfirmDialog } from "@nafios/ui/components/confirm-dialog";
```

Use the theme toggle:

```tsx
import { useTheme } from "@nafios/ui/hooks/use-theme";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>Toggle</button>;
}
```

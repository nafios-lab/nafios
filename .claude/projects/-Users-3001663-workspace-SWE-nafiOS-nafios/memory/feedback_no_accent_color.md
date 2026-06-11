---
name: No accent color for hover/focus states
description: Avoid using accent color (bg-accent, text-accent-foreground) for hover and focus states in UI components — use muted instead
type: feedback
---

Do not use `accent` color tokens (bg-accent, text-accent-foreground) for hover/focus/today states in components. The accent color looks off with the NafiOS theme.

**Why:** The accent color (blue) clashes with the overall brand palette when used for interactive states. The muted token blends better.

**How to apply:** Use `bg-muted` + `text-foreground` for hover/today/selection-range states. Reserve accent for intentional brand moments. Also prefer `rounded-full` for interactive buttons (calendar days, selectors) rather than `rounded-md`.

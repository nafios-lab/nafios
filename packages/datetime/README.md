# @nafios/datetime

Shared calendar-time primitives: the `Month` value type (`"YYYY-MM"`) + its
codec and month math, leap-year-aware `daysInMonth`, month-label formatters, and
the calendar `CodecError`. Pure — zero I/O, no clock; callers supply "today".

```ts
import { monthOf, addMonths, formatMonthLong } from "@nafios/datetime";

const now = monthOf("2026-07-15");        // "2026-07"
formatMonthLong(addMonths(now, 1));       // "August 2026"
```

See [spec.md](./spec.md) for the full surface and [CLAUDE.md](./CLAUDE.md) for
agent context.

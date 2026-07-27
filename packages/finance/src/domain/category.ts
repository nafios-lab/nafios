// @nafios/finance — domain layer (pure). The Category domain type (EF3.9).
//
// A persisted category, decoded from a `category` row. User-owned and fully
// mutable (rename / reorder / recolor / delete) — categories are organizational
// labels with NO priority or payment-sequencing semantics (finance-domain-spec
// §3). This type is the read shape the category mapper decodes rows into and the
// runtime picker (EF3.14) / grouping (EF3.13) consume.
//
// `user_id`, `created_at`, `updated_at` are NOT surfaced — they are RLS/audit
// concerns of the row, not the domain. No money, no enum, no codec: the simplest
// domain type in the package (zero I/O, like every `src/domain/` file).

/**
 * A persisted category. `displayOrder` mirrors the row's `display_order` (the
 * user-reorderable visual position); `color` is a hex/token string or null when
 * unset. Names are ordinary user strings — nothing downstream keys off them.
 */
export interface Category {
  readonly id: string;
  readonly name: string;
  readonly displayOrder: number; // -> display_order
  readonly color: string | null; // hex or token; null = unset
}

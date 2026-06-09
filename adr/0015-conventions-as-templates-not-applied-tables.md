# 0015. Conventions delivered as templates, not applied tables

- **Status:** Accepted
- **Date:** 2026-06-09
- **Source:** datasource-be-foundation epic (C1)

## Context

The datasource-be-foundation epic establishes migration machinery, column
conventions, and RLS patterns — but no product requirements exist yet to
justify creating real tables. We need to capture conventions without
prematurely committing schema.

## Decision

Data conventions (standard columns, RLS patterns, naming rules) are delivered
as **documented copy-paste templates**, not applied tables. The foundation
data epic ships **zero NafiOS tables**. The first table and the
ownership/tenancy model are authored by the first product/app epic.

## Consequences

- The migration system is proven via a rolled-back integration test (B3), not
  a committed table.
- Future domains copy the template and adapt it — consistency without rigidity.
- The ownership column, PK strategy (UUID v4 vs v7), and tenancy model remain
  open decisions until the first real table needs them.
- No dead-weight "example" tables pollute the schema.

## Alternatives considered

- **Ship a reference table** — proves the pipeline more concretely, but creates
  schema that no product owns and must eventually be removed.
- **Defer all conventions to the first product epic** — risks inconsistency if
  multiple domains start in parallel without a shared template.

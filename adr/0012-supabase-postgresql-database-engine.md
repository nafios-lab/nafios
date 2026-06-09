# 0012. Supabase / PostgreSQL as the database engine

- **Status:** Accepted
- **Date:** 2026-06-09
- **Source:** datasource-be-foundation epic (C1)

## Context

NafiOS needs a database engine for its suite of AI-native apps. The choice was
deferred during the foundation epic (noted as "Database engine — deferred" in the
ADR index). We need managed auth, row-level security, real-time subscriptions,
and storage — all without bolting on separate services for each.

## Decision

Use **Supabase** (backed by **PostgreSQL**) as the database engine and backend-
as-a-service layer. The local development stack runs via the Supabase CLI and
Docker; production uses Supabase Cloud (or a self-hosted equivalent).

## Consequences

- PostgreSQL is the single source of truth for all persistent data.
- We gain Supabase's built-in auth (`auth.users`), RLS, real-time, and storage
  without assembling them ourselves.
- Local development requires a container runtime (Docker Desktop, Colima, or
  Podman) to run the Supabase stack.
- We are coupled to Supabase's conventions (migration directory, CLI commands,
  generated types) — an acceptable trade-off given the productivity gain.
- Resolves the previously-deferred "Database engine" entry in the ADR index.

## Alternatives considered

- **PlanetScale / MySQL** — strong DX, but no built-in auth or RLS; would
  require assembling more infrastructure.
- **Firebase / Firestore** — document model is a poor fit for relational
  financial data and cross-table queries.
- **Raw PostgreSQL (no BaaS)** — maximum control, but we'd reimplement auth,
  real-time, and storage ourselves.

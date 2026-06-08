# 0003. REST over GraphQL for service APIs

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** nafios-foundation epic

## Context

Services in `services/` expose APIs consumed by apps and AI agents. We need a
protocol that is simple to implement, easy for agents to call, and debuggable
with standard tools.

## Decision

Use **REST** (JSON over HTTP) for all service APIs. No GraphQL.

## Consequences

- APIs are curl-friendly and trivially callable by AI agents with no special client.
- Each endpoint has a clear HTTP method and URL — easy to document in specs.
- No schema stitching, resolver complexity, or N+1 query pitfalls to manage.
- Clients may over-fetch; acceptable at current scale. If a service genuinely
  needs flexible queries later, we can add GraphQL for that service specifically.

## Alternatives considered

- **GraphQL** — powerful for complex client-driven queries, but adds schema
  management overhead, tooling (codegen, Apollo/urql), and a steeper learning
  curve for agents. Over-engineering for our current API surface.
- **gRPC** — excellent for service-to-service, but poor browser support and
  requires protobuf tooling. Not suited for app-to-service communication.
- **tRPC** — type-safe and lightweight, but couples client and server to
  TypeScript and adds a framework dependency. May revisit for internal APIs.

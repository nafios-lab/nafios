# 0004. Vercel AI SDK v6 as the LLM abstraction, wrapped behind `@nafios/ai-core`

- **Status:** Accepted
- **Date:** 2026-06-08
- **Source:** nafios-foundation epic

## Context

NafiOS's AI assistant layer needs to call LLMs (streaming, tool use, structured
output). We want a provider-agnostic abstraction so we can swap models without
rewriting application code.

## Decision

Use **Vercel AI SDK v6** as the LLM abstraction layer, wrapped behind the
`@nafios/ai-core` package. Application code imports from `@nafios/ai-core`,
never from `ai` or provider packages directly.

## Consequences

- `@nafios/ai-core` is the single seam for LLM access — swapping providers or
  SDK versions is a one-package change.
- Vercel AI SDK gives us streaming, tool calling, and structured output with
  minimal glue code.
- TanStack AI integration is deferred to low-stakes pilots; the wrapper preserves
  that optionality without committing to it now.
- If Vercel AI SDK's direction diverges from our needs, the wrapper limits blast
  radius to one package.

## Alternatives considered

- **Direct provider SDKs** (e.g. `@anthropic-ai/sdk`, `openai`) — no abstraction
  layer means rewriting every callsite when switching providers.
- **LangChain** — heavy abstraction with opinions on chains/agents we don't need.
  Adds significant dependency weight.
- **TanStack AI** — promising but young; we'll pilot it inside `@nafios/ai-core`
  when it stabilizes rather than committing repo-wide.

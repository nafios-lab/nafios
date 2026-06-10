# 0017. Manual deploy via GitHub Actions + Netlify CLI

- **Status:** Accepted
- **Date:** 2026-06-10
- **Source:** S4 / S5 — Staging Deployment Rail

## Context

NafiOS uses Netlify for hosting but has a hard 300-credit/month cap on the free
tier. Each deploy costs ~15 credits, so uncontrolled auto-deploys on push would
burn through the budget in days. We need a deploy mechanism that is deliberate,
reproducible, and budget-safe.

GitHub Actions provides unlimited build minutes on public repos and generous
minutes on private repos, whereas Netlify charges credits for both builds and
deploys. Separating build (GitHub Actions) from deploy (Netlify CLI) keeps heavy
compute free and uses Netlify only as a deploy target.

## Decision

1. **Build in GitHub Actions, deploy via `netlify deploy` CLI** — the workflow
   builds the app in CI, then uploads the pre-built output to Netlify using
   `netlify deploy --prod`. Netlify never runs a build itself.
2. **Manual trigger only (`workflow_dispatch`)** — deploys happen when a human
   clicks "Run workflow" in the Actions UI. No `on: push` or `on: pull_request`
   triggers exist for the deploy workflow.
3. **GitHub Environment protection** — the `staging` environment can have
   protection rules (e.g. required reviewers) to gate who can trigger a deploy.
4. **Netlify Git-build link disabled** — the Netlify site has no linked Git repo;
   `netlify.toml` overrides `command` to a no-op as a safety net.

## Consequences

- Every deploy is a conscious budget decision (~15 credits).
- Developers get fast CI feedback (checks on push via `ci.yml`) without
  triggering a deploy.
- Preview deploys are not available by default; adding them requires a separate,
  budget-aware ticket.
- The deploy workflow is the single source of truth for how staging ships.

## Alternatives considered

- **Netlify Git auto-build:** Simplest setup, but every push triggers a build +
  deploy (~15 credits), quickly exhausting the monthly budget.
- **Netlify build with deploy locks:** Still consumes build credits even when
  locked; complex to manage.
- **Deploy on push to `staging` branch:** Slightly more automated, but still
  risks accidental deploys and credit burn from branch pushes.

# Staging Deploy Workflow — Developer Guide

> **Strategy:** Tag-at-deploy-time (Option B)
> **Rule:** Every deploy gets a version tag. Every version tag means it was deployed.

---

## How it works

```
develop on branch → PR to main → merge → manually trigger deploy → workflow tags + builds + deploys
```

| Step | Who | What happens |
|------|-----|-------------|
| 1. Code | Developer | Work on a feature branch, push commits |
| 2. PR | Developer | Open a PR to `main`, CI runs checks automatically |
| 3. Merge | Developer | Merge the PR after review/approval |
| 4. Deploy | Developer | Manually trigger the deploy workflow from GitHub Actions |
| 5. Tag | Workflow | The workflow auto-tags `main` with `v0.1.<run_number>` |
| 6. Build | Workflow | Bun installs, checks, and builds `@nafios/web` |
| 7. Ship | Workflow | `netlify deploy --prod` pushes the build to staging |
| 8. Verify | Developer | Click the deploy URL in the run summary to verify |

---

## Step-by-step: Triggering a deploy

### 1. Go to the Actions tab

Navigate to the repository on GitHub and click the **Actions** tab.

### 2. Select the workflow

In the left sidebar, click **"Deploy to Staging"**.

### 3. Click "Run workflow"

You'll see a **"Run workflow"** dropdown button on the right side. Click it.

### 4. Fill in the inputs

| Input | What to enter | Default |
|-------|--------------|---------|
| **Branch** | Select the branch the workflow file lives on (usually `main`) | `main` |
| **Git ref to deploy** | The branch, tag, or SHA you want to deploy | `main` |

For a standard staging deploy after merging a PR, leave both as `main`.

### 5. Click the green "Run workflow" button

The job will start. You can watch it in real time.

### 6. Check the result

When the job completes, open the run summary. You'll see a table with:

- **Ref** — what was deployed
- **SHA** — the exact commit
- **URL** — the live staging URL (click it to verify)

---

## Versioning scheme

```
v0.1.<GITHUB_RUN_NUMBER>
```

- `0.1` — the current major.minor, bumped manually when the product hits milestones
- `<GITHUB_RUN_NUMBER>` — auto-incremented by GitHub on every workflow run

### Examples

| Run | Tag | Meaning |
|-----|-----|---------|
| 1st deploy | `v0.1.1` | First staging deploy |
| 2nd deploy | `v0.1.2` | Second staging deploy |
| 15th deploy | `v0.1.15` | Fifteenth staging deploy |

### When to bump major.minor

| Version | When |
|---------|------|
| `v0.1.x` | Pre-launch development (now) |
| `v0.2.x` | First major feature milestone |
| `v1.0.x` | Public launch / production |

Bumping major.minor is a manual decision — update the version string in the workflow file when the time comes.

---

## Deploying a feature branch (UAT before merge)

You can deploy any branch for testing before it's merged:

1. Trigger the workflow as above
2. Set **"Git ref to deploy"** to your branch name (e.g. `feat/my-feature`)
3. The workflow checks out that branch, builds, and deploys

**Important:** This overwrites what's currently on staging. When you're done testing, re-deploy `main` to restore it.

**Note:** Branch deploys do NOT get a version tag — tags are only created when deploying `main`. This keeps the tag history clean: tags = production-ready deploys.

---

## What gets deployed

The workflow builds `@nafios/web` (the TanStack Start SSR app) and deploys:

- **Static assets** — `.output/public/` (client JS, CSS, images)
- **SSR function** — `.netlify/v1/functions/server.mjs` (server-side rendering)

The build happens on GitHub Actions (free compute). Only the finished output is uploaded to Netlify (~15 credits per deploy).

---

## Viewing deploy history

### Git tags (version history)

```bash
# List all deploy tags, newest first
git tag --sort=-version:refname

# Show what commit a tag points to
git log -1 v0.1.5

# Compare two deploys
git diff v0.1.4..v0.1.5
```

### GitHub Actions (run history)

Go to **Actions > Deploy to Staging** to see every run, its status, inputs, and the deploy URL in the summary.

### Netlify (deploy history)

The Netlify dashboard shows every deploy with its timestamp and commit message (`staging deploy main <sha>`).

---

## What runs automatically vs. manually

| Trigger | Workflow | What it does |
|---------|----------|-------------|
| Push / PR to `main` | `ci.yml` | Lint, typecheck, tests (no deploy) |
| Manual button click | `deploy-staging.yml` | Build + tag + deploy to staging |
| Nothing else | — | No auto-deploys exist anywhere |

A push or merge to `main` will **never** trigger a deploy. Deploys are always a conscious decision.

---

## Budget

| Resource | Limit | Cost per deploy |
|----------|-------|----------------|
| Netlify credits | 300/month | ~15 per deploy |
| Max deploys/month | ~20 | — |
| GitHub Actions minutes | Generous/unlimited | Free |

The manual trigger ensures every deploy is intentional. No surprise credit burn.

---

## Troubleshooting

### Deploy failed at "Preflight checks"

The `bun run check` step failed — same checks that run in CI. Fix the issue on your branch, merge to `main`, and re-deploy.

### Deploy succeeded but site shows old content

- Verify the correct ref was deployed (check the run summary)
- Hard-refresh the browser (`Cmd+Shift+R`) — assets are cached with immutable headers
- Check the Netlify dashboard to confirm the deploy landed

### "Could not resolve NETLIFY_SITE_ID" or auth errors

The repository secrets `NETLIFY_AUTH_TOKEN` or `NETLIFY_SITE_ID` are missing or expired. Re-add them in **Settings > Secrets and variables > Actions**.

### Tag already exists

This shouldn't happen since `GITHUB_RUN_NUMBER` is unique and always increments. If it does, the tag step will fail but the deploy will still succeed (the site is live, just untagged). Investigate and manually tag if needed.

---

## Quick reference

```bash
# What's currently deployed? Check the latest tag:
git describe --tags --abbrev=0

# What changed since last deploy?
git log $(git describe --tags --abbrev=0)..HEAD --oneline

# Ready to deploy? Go to:
# https://github.com/<org>/<repo>/actions/workflows/deploy-staging.yml
```

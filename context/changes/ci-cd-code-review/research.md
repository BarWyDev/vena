---
date: 2026-06-19T00:00:00+00:00
researcher: BarWyDev
git_commit: c6ef859a6a109e80e533b17042e4a283d28aacd0
branch: apply-10x-toolkit-m5
repository: vena
topic: "CI/CD workflow for automated AI-powered PR code reviews"
tags: [research, codebase, ci-cd, github-actions, code-review, openrouter]
status: complete
last_updated: 2026-06-19
last_updated_by: BarWyDev
---

# Research: CI/CD Workflow for Automated AI-Powered PR Code Reviews

**Date**: 2026-06-19  
**Researcher**: BarWyDev  
**Git Commit**: `c6ef859a6a109e80e533b17042e4a283d28aacd0`  
**Branch**: `apply-10x-toolkit-m5`  
**Repository**: vena

## Research Question

What exists in the codebase (CI setup, code-review package, GitHub Actions patterns) that the new `ci-cd-code-review` change must wire together, and what are the critical gaps and decisions before planning the implementation?

Based on `context/changes/ci-cd-code-review/requairments.md`.

## Summary

The `packages/code-review/` package already exists and is functional — it exposes `createReviewer().review(diff)` returning `{ summary, findings[] }`. The existing CI workflow is a single file with no label triggers, no GH CLI usage, and no composite actions. The new workflow requires:

1. A **composite action** at `.github/actions/ai-code-review/action.yml` with a `tsx`-based runner script.
2. A **new workflow file** `.github/workflows/ai-code-review.yml` with `pull_request` trigger (types: opened, synchronize, reopened, labeled).
3. **Updates to `packages/code-review/src/prompt.ts`** to incorporate the 5 Vena-specific criteria from the requirements.
4. **One new GitHub secret**: `OPENROUTER_API_KEY`.
5. **Three pre-created labels**: `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review`.

Pass/fail is derived from finding severity: any `error`-severity finding → `ai-cr:failed`.

---

## Detailed Findings

### 1. Existing CI/CD Setup

**File:** `.github/workflows/ci.yml` (only workflow file in the repo)

- **Triggers**: `push` to `main`; `pull_request` targeting `main` — no label triggers, no `workflow_dispatch`, no `schedule`.
- **`ci` job** (runs on push AND pull_request): checkout → Node 22 setup → `npm ci` → `npx astro sync` → `npm run lint` → `npx supabase start` → resolve local Supabase creds into `$GITHUB_ENV` → `npm test` → `npm run build` (with `SUPABASE_URL`/`SUPABASE_KEY` secrets).
- **`deploy` job** (only on push, `needs: ci`): same setup → build → `npx wrangler deploy` (needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` secrets).
- **No GH CLI usage anywhere** — `gh` commands are absent from the existing workflow.
- **No composite actions** — nothing under `.github/actions/`.
- **No label automation** — no existing label infrastructure.
- **Node version**: 22. **Package manager**: `npm ci`. **Checkout**: `actions/checkout@v4` shallow clone.

**Key constraint**: The existing workflow targets `main`, not `master`. Requirements file says "master" — this is a typo; all new workflows must also target `main`.

### 2. `packages/code-review/` Package

**Package identity:**
- Name: `@vena/code-review` (`packages/code-review/package.json:2`)
- Type: ESM module (`"type": "module"`)
- No npm workspaces at root — this package is **standalone** (has its own `node_modules`)
- Runtime deps: `ai` v6.0.206, `@openrouter/ai-sdk-provider` v2.9.1, `zod` v4.4.3
- Dev: `tsx` v4.22.4 (TypeScript runner — used for all execution)

**Public API** (`packages/code-review/src/index.ts`):
```typescript
import { createReviewer, createProvider, DEFAULT_MODEL } from '@vena/code-review';
// or directly:
import { createReviewer } from './packages/code-review/src/index.ts';

const reviewer = createReviewer({ rootDir: '/path/to/repo' });
const result = await reviewer.review(diffString);
// result: { summary: string, findings: ReviewFinding[] }
```

**Output schema** (`packages/code-review/src/schema.ts`):
```typescript
ReviewResult = {
  summary: string;       // one-paragraph overview
  findings: Array<{
    severity: 'info' | 'warning' | 'error';
    file: string;        // repo-relative path
    line: string | null; // 1-based or null
    message: string;
    suggestion: string;
  }>;
}
```

**Provider**: OpenRouter (NOT direct Anthropic API)
- API key env var: `OPENROUTER_API_KEY`
- Default model: `anthropic/claude-haiku-4.5` via OpenRouter (can override with `OPENROUTER_MODEL`)
- SDK: Vercel AI SDK + `@openrouter/ai-sdk-provider`
- Agent type: `ToolLoopAgent` with a `readFile` tool confined to `rootDir`

**Current prompt** (`packages/code-review/src/prompt.ts:1-16`):
- Generic "correctness & safety" + "convention compliance" instructions
- Reads `CLAUDE.md` and `AGENTS.md` before reviewing
- **Does NOT include the 5 Vena-specific criteria** from `requairments.md`
- `buildReviewPrompt(diff)` only takes diff — no PR title/description injection

**Execution model**: No standalone CLI. All execution via `tsx` (`npm start` runs `src/demo.ts`). The composite action needs a purpose-built runner script.

### 3. GitHub Actions Patterns for This Workflow

**Event trigger for label-triggered review:**
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled]
    branches: [main]
```
The `labeled` activity type fires when any label is added. A gate step checks `github.event.label.name == 'ai-cr:review'` to filter to on-demand retries only.

**Why `pull_request` (not `pull_request_target`):**
- `pull_request_target` does not support `labeled` activity type — it cannot gate on label-add.
- `pull_request` is safe here: label-add is a maintainer action (requires write access).
- `pull_request` runs workflow code from the PR branch — acceptable since maintainers are adding labels to trusted PRs.

**Composite action structure** (`.github/actions/ai-code-review/action.yml`):
```yaml
runs:
  using: composite
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: 22, cache: npm }
    - run: npm ci   # inside packages/code-review/
    - run: tsx run-review.ts   # outputs JSON to $GITHUB_OUTPUT
    - uses: actions/github-script@v7   # post comment + update labels
```

**Required job permissions:**
```yaml
permissions:
  contents: read         # checkout + read diff
  pull-requests: write   # post comments + add/remove labels
```
`GITHUB_TOKEN` is auto-injected — no extra secrets needed for GitHub API calls.

**Label management via `actions/github-script@v7`:**
```javascript
// Add pass/fail label (remove the opposite)
github.rest.issues.addLabels({ issue_number, owner, repo, labels: ['ai-cr:passed'] });
github.rest.issues.removeLabel({ issue_number, owner, repo, name: 'ai-cr:failed' })
  .catch(() => {}); // safe if label not present
```

**Label `ai-cr:review` cleanup**: After the on-demand review runs, the workflow should remove the `ai-cr:review` label so it can be re-added to trigger again without conflict.

---

## Code References

- `packages/code-review/src/index.ts` — public API: `createReviewer`, `createProvider`, schemas
- `packages/code-review/src/agent.ts` — `createReviewer()` factory + `ToolLoopAgent` setup
- `packages/code-review/src/schema.ts` — Zod schemas: `ReviewResult`, `ReviewFinding`, `Severity`
- `packages/code-review/src/provider.ts` — OpenRouter provider + `DEFAULT_MODEL` constant
- `packages/code-review/src/prompt.ts` — `REVIEW_INSTRUCTIONS` (needs 5-criteria update) + `buildReviewPrompt()`
- `packages/code-review/src/tools/read-file.ts` — `readFile` tool with `realpath` path-traversal guard
- `packages/code-review/package.json` — no workspaces; `tsx` for execution; Node >=22
- `.github/workflows/ci.yml` — existing workflow (no label triggers, no GH CLI, no composite actions)

---

## Architecture Insights

### Files to Create

| File | Purpose |
|------|---------|
| `.github/actions/ai-code-review/action.yml` | Composite action definition |
| `.github/actions/ai-code-review/run-review.ts` | `tsx` runner: fetches diff, calls `createReviewer`, writes output |
| `.github/workflows/ai-code-review.yml` | Main workflow with `pull_request` trigger + label gate |

### Files to Modify

| File | Change |
|------|--------|
| `packages/code-review/src/prompt.ts` | Extend `REVIEW_INSTRUCTIONS` with the 5 Vena-specific scoring criteria from `requairments.md` |

### Pass/Fail Logic

The package outputs `findings[]` with severity levels, not per-criterion scores. The simplest pass/fail rule:

```
any finding with severity === 'error'  →  ai-cr:failed
all findings info/warning only         →  ai-cr:passed
```

This maps well to the requirements: criteria marked "critical" (Security & Auth) would emit `error`-severity findings on violations, while lower-weight issues emit `warning`.

### Runner Script Design (`.github/actions/ai-code-review/run-review.ts`)

The runner needs to:
1. Read the PR diff from a temp file (avoids shell escaping of large diffs)
2. Optionally read PR title from an env var (for prompt enrichment)
3. Call `createReviewer({ rootDir: process.env.GITHUB_WORKSPACE! }).review(diff)`
4. Determine pass/fail from severity
5. Write structured output to `$GITHUB_OUTPUT` for subsequent steps

```typescript
// Skeleton
import { createReviewer } from '../../../packages/code-review/src/index.ts';
import { readFileSync, appendFileSync } from 'node:fs';

const diff = readFileSync('/tmp/pr.diff', 'utf-8');
const reviewer = createReviewer({ rootDir: process.env.GITHUB_WORKSPACE! });
const result = await reviewer.review(diff);

const passed = !result.findings.some(f => f.severity === 'error');
const label = passed ? 'ai-cr:passed' : 'ai-cr:failed';

appendFileSync(process.env.GITHUB_OUTPUT!, [
  `passed=${passed}`,
  `label=${label}`,
  `summary=${JSON.stringify(result.summary)}`,
  `findings=${JSON.stringify(result.findings)}`,
].join('\n') + '\n');
```

> **Note**: Multiline outputs require the `<<EOF` heredoc syntax for `$GITHUB_OUTPUT`. Use separate env files or JSON-encoded single-line values.

### Secret Required

One new GitHub repository secret must be added:
- **`OPENROUTER_API_KEY`** — OpenRouter API key for LLM access

The model default is `anthropic/claude-haiku-4.5` (cost-efficient). `OPENROUTER_MODEL` can override it if needed.

### PR Diff Fetching in Composite Action

Within a composite action triggered by `pull_request`, the diff is available via GH CLI:
```bash
gh pr diff ${{ inputs.pull-number }} > /tmp/pr.diff
```
Requires `GITHUB_TOKEN` to be passed through as an env var (`GH_TOKEN=${{ inputs.github-token }}`).

Alternatively use `git diff`:
```bash
git fetch origin ${{ github.base_ref }}
git diff origin/${{ github.base_ref }}...HEAD > /tmp/pr.diff
```
(Requires `fetch-depth: 0` on checkout)

### PR Title as Input (Cost Tradeoff)

`requairments.md` marks PR description as `(?? cost tradeoff)`. Recommendation:
- **Include PR title** (always — low token cost, high signal for convention/intent alignment).
- **Skip PR description** by default — the diff is the ground truth. Description can be added via `OPENROUTER_MODEL` override to a larger model if needed later.

The `buildReviewPrompt()` in `prompt.ts` currently only takes `diff`. It should be extended to accept an optional `prTitle?: string` and prepend it to the prompt.

---

## Historical Context (from prior changes)

No prior research artifacts found in `context/changes/` or `context/archive/` for CI/CD topics. This is the first CI workflow change beyond the initial setup commit.

The existing CI workflow (`ci.yml`) was committed as part of the foundational project setup. Its pattern (checkout → node setup → npm ci → astro sync → lint → test → build) is the baseline all new jobs should follow for Node/npm steps.

---

## Related Research

None yet — this is the first research artifact for this change.

---

## Open Questions

1. **Should `prompt.ts` be updated to score per-criterion (1-10)?** Requirements list per-criterion scores, but the current schema has no numeric scores — only `findings[]` with severity. Updating the schema to output `{ criteria: Record<string, number>, summary, findings }` would match requirements exactly but requires schema + agent changes. The simpler severity-based pass/fail may be sufficient for v1.

2. **Composite action runner location**: Should `run-review.ts` live inside `.github/actions/ai-code-review/` (co-located with the action) or inside `packages/code-review/src/` as a proper CLI entrypoint? Co-location is simpler; inside the package is more reusable.

3. **`pr-description` cost decision**: Confirmed as out-of-scope for now (marked `??` in requirements). Can be added via env var toggle in a future iteration.

4. **Label pre-creation**: `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` must be created in the GitHub repo before the workflow can apply them. This is a manual setup step or can be automated via a one-time `gh label create` script.

5. **Re-run deduplication**: If `ai-cr:review` label triggers a re-run, should previous `ai-cr:passed`/`ai-cr:failed` labels be removed before the review starts? Probably yes — to avoid stale labels while review is in progress.

6. **Workflow file: new file vs. add job to `ci.yml`?** Requirements say "separate composite action for the review itself" — a separate workflow file is cleaner and avoids coupling AI review to the build gate.

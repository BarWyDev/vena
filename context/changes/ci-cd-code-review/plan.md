# CI/CD Automated AI Code Review — Implementation Plan

## Overview

Wire the existing `packages/code-review/` package into a GitHub Actions pull request workflow. Every PR targeting `main` triggers an AI-powered review across five Vena-specific criteria; results appear as a PR comment with a badge, a per-criterion status table, and a collapsible findings list. A `ai-cr:passed` or `ai-cr:failed` label is applied. Adding `ai-cr:review` triggers an on-demand re-run.

## Current State Analysis

The `packages/code-review/` package already exists and is fully functional: `createReviewer({ rootDir }).review(diff)` returns `{ summary, findings[] }`. What it lacks:

- **Vena-specific criteria** — the prompt is generic; the 5 project-specific criteria from `requairments.md` are not in the instructions.
- **`criterion` tagging** — `ReviewFinding` has no field to identify which criterion a finding belongs to.
- **PR title injection** — `buildReviewPrompt(diff)` accepts only the diff; the PR title cannot be threaded through.

The existing CI workflow (`.github/workflows/ci.yml`) has no label triggers, no composite actions, and no GH CLI usage. There are no composite actions under `.github/actions/`.

### Key Discoveries

- `packages/code-review/` is a standalone ESM package (no root workspaces); `tsx` is its runtime (`node_modules/.bin/tsx`)
- Default model: `anthropic/claude-haiku-4.5` via OpenRouter (`OPENROUTER_API_KEY` env var)
- The existing workflow targets `main` — requirements say "master" which the research confirms is a typo; all new triggers must also target `main`
- `GITHUB_TOKEN` is auto-injected and sufficient for comment + label operations (no extra secrets needed for GH API)
- `pull_request` (not `pull_request_target`) is the correct trigger — `pull_request_target` does not support `labeled` activity type

## Desired End State

A new composite action at `.github/actions/ai-code-review/` and a new workflow at `.github/workflows/ai-code-review.yml`. On every PR opened, synchronized, or reopened against `main`:

1. Labels `ai-cr:passed`, `ai-cr:failed`, `ai-cr:review` are provisioned in the repo (no-op if already present).
2. Any stale review labels are removed from the PR.
3. The AI reviewer runs, evaluating the diff against 5 Vena-specific criteria.
4. A PR comment appears with: pass/fail badge, per-criterion status table (✅/⚠️/❌), and a collapsible findings list.
5. Either `ai-cr:passed` or `ai-cr:failed` is applied to the PR.
6. Adding `ai-cr:review` to a PR triggers the same flow again (re-run on demand).

### Key Discoveries

- `packages/code-review/src/index.ts` — public API
- `packages/code-review/src/schema.ts` — `ReviewResult`, `ReviewFinding` (add `Criterion` here)
- `packages/code-review/src/prompt.ts` — `REVIEW_INSTRUCTIONS` + `buildReviewPrompt()` (replace/extend here)
- `packages/code-review/src/agent.ts` — `createReviewer()` + `review()` (thread prTitle here)
- `.github/workflows/ci.yml` — baseline for Node/npm step patterns

## What We're NOT Doing

- Per-criterion numeric scores (1-10) — findings are tagged with `criterion` and the worst severity per criterion determines the table status; no numeric scoring in v1
- PR description as input — marked as cost-tradeoff in requirements; excluded from v1
- Business alignment / architectural fit criteria — explicitly parked in requirements
- Label pre-creation as a manual step — the workflow self-provisions via `createLabel --force`
- Runner script inside `packages/code-review/src/` — co-located in the action for simplicity
- Caching in the composite action — `npm ci` for the small code-review package is fast enough

## Implementation Approach

Three phases in dependency order:

1. Extend the package (schema + prompt + agent) — no GH Actions changes, self-contained.
2. Build the composite action (action definition + tsx runner script).
3. Create the workflow that calls the action.

Phase 1 outputs are consumed by Phase 2; Phase 2 output is consumed by Phase 3.

## Critical Implementation Details

**Runner executes tsx from the package's local node_modules.** The composite action must run `$GITHUB_WORKSPACE/packages/code-review/node_modules/.bin/tsx $GITHUB_WORKSPACE/.github/actions/ai-code-review/run-review.ts` — there is no global tsx. Install must happen in `packages/code-review/` (`working-directory: packages/code-review`), not at the repo root.

**Composite action checkout is mandatory.** The action uses `uses: ./.github/actions/ai-code-review` which resolves to the current repo, but the runner needs the files to be present. The composite action's first step must be `actions/checkout@v4`.

**Re-run label cleanup is unconditional.** Remove all three labels at job start with `.catch(() => {})` on each removal — 404s (label not on PR yet) are safe to ignore. This keeps the logic branchless.

**Multiline `$GITHUB_OUTPUT` values.** The runner writes pass/fail as single-line key=value entries. Comment markdown and full results are written to `/tmp/review-comment.md` and `/tmp/review-result.json` — the github-script steps read these files directly, avoiding heredoc escaping for multiline content.

---

## Phase 1: Extend `packages/code-review/src/`

### Overview

Add per-criterion tagging to the schema, replace the generic prompt with Vena-specific 5-criteria instructions, and thread PR title through the review call.

### Changes Required

#### 1. `Criterion` enum and `ReviewFinding` extension

**File**: `packages/code-review/src/schema.ts`

**Intent**: Add a `Criterion` enum for the five Vena review axes and add an optional `criterion` field to `ReviewFinding`. Findings tagged with `criterion` allow the runner to build a per-criterion status table without changing the top-level `ReviewResult` shape.

**Contract**: Add `Criterion` as a `z.enum(['security', 'correctness', 'typescript', 'conventions', 'cloudflare'])`. Add `criterion: Criterion.optional()` to `ReviewFinding`. Both types are exported.

#### 2. Replace generic review instructions with Vena-specific criteria

**File**: `packages/code-review/src/prompt.ts`

**Intent**: Replace the two-point generic `REVIEW_INSTRUCTIONS` with a prompt that describes the five Vena-specific criteria, their severity mapping (what constitutes error/warning/info for each), and instructs the LLM to tag every finding with the correct `criterion` value.

**Contract**: `REVIEW_INSTRUCTIONS` is a string constant. `buildReviewPrompt(diff: string, prTitle?: string): string` — prepends `PR title: <value>\n\n` when prTitle is provided; otherwise unchanged. The diff block and prompt-injection warning remain.

The criteria mappings to embed:

| Criterion key | Display name | error examples | warning example |
|---|---|---|---|
| `security` | Security & Auth | `process.env` for secrets; `supabase.auth.getUser()` in pages/components; missing null-check on client; unprotected route | one minor deviation with no real attack surface |
| `correctness` | Correctness & Edge Cases | crash bug; silent data loss; unchecked user input to DB; API route returns JSON error instead of redirect | edge case missed but unlikely |
| `typescript` | TypeScript & Type Safety | widespread `any`; type-cast chains; runtime type mismatch | single justified `any` or `!` |
| `conventions` | Project Convention Compliance | bypasses React Compiler rules; new UI lib; breaks `@/` alias throughout | minor style deviation (one missing alias) |
| `cloudflare` | Cloudflare Workers Compatibility | `fs`, `process.cwd()`, Node-only APIs | Node API polyfilled by wrangler but not guaranteed |

The `readFile` tool instructions (read CLAUDE.md / AGENTS.md; inspect referenced source files) remain in the prompt.

#### 3. Thread `prTitle` through `review()`

**File**: `packages/code-review/src/agent.ts`

**Intent**: Update the `review` method to accept an optional `prTitle` and pass it to `buildReviewPrompt`. No change to `ReviewerConfig` — title is per-call, not per-reviewer instance.

**Contract**: `review(diff: string, prTitle?: string): Promise<ReviewResult>`

#### 4. Export `Criterion` from barrel

**File**: `packages/code-review/src/index.ts`

**Intent**: Add `Criterion` to the public exports so downstream consumers (including the runner script) can import it alongside `Severity`, `ReviewFinding`, and `ReviewResult`.

**Contract**: Add `Criterion` to the existing `export { … } from './schema.js'` line.

### Success Criteria

#### Automated Verification

- `npm run lint` passes inside `packages/code-review/`
- `npx tsc --noEmit` passes inside `packages/code-review/` (or equivalent type-check command)
- `npm start` (demo) completes without runtime errors

#### Manual Verification

- Run the demo against a small diff; inspect the raw output — each `ReviewFinding` in the JSON response carries a `criterion` field matching one of the five enum values
- Confirm the prompt includes at least one visible reference to each of: `security`, `correctness`, `typescript`, `conventions`, `cloudflare`

**Implementation Note**: Pause after this phase for manual spot-check of the criterion tagging before wiring into GH Actions.

---

## Phase 2: Composite Action

### Overview

Create the self-contained composite action that fetches the PR diff, runs the AI reviewer, generates the formatted PR comment, and posts comment + labels via GitHub API.

### Changes Required

#### 1. Action definition

**File**: `.github/actions/ai-code-review/action.yml`

**Intent**: Define the composite action with four inputs, and wire up the full step sequence: checkout → Node setup → package deps → diff fetch → tsx runner → post comment → apply result label.

**Contract**:

```
inputs:
  pull-number   (required) — PR number for gh pr diff and comment/label calls
  github-token  (required) — passed to GH CLI (GH_TOKEN) and github-script steps
  openrouter-api-key (required) — forwarded as OPENROUTER_API_KEY to the runner
  pr-title      (optional, default '') — forwarded as PR_TITLE to the runner

runs:
  using: composite
  steps:
    1. actions/checkout@v4
    2. actions/setup-node@v4  { node-version: '22' }
    3. npm ci  (working-directory: packages/code-review)
    4. gh pr diff <pull-number> > /tmp/pr.diff  (env: GH_TOKEN)
    5. tsx runner  (env: OPENROUTER_API_KEY, PR_TITLE)
    6. actions/github-script@v7  — post/update PR comment
    7. actions/github-script@v7  — add result label
```

The github-script steps pass `github-token: ${{ inputs.github-token }}` explicitly.

Step 6 (comment): list existing comments on the PR, find a prior bot comment whose body contains `AI Code Review`, update it if found, otherwise create a new one. Comment body is read from `/tmp/review-comment.md`.

Step 7 (label): read `/tmp/review-result.json`, call `issues.addLabels` with the `label` field value.

#### 2. Runner script

**File**: `.github/actions/ai-code-review/run-review.ts`

**Intent**: Entry point that the composite action runs via tsx. Reads the diff file and PR title from the environment, invokes the reviewer, derives pass/fail from error-severity findings, renders the formatted PR comment markdown, and writes result files + GITHUB_OUTPUT entries for downstream steps.

**Contract**:

Imports: `createReviewer` from `'../../../packages/code-review/src/index.ts'`; `readFileSync`, `writeFileSync`, `appendFileSync` from `'node:fs'`.

Environment inputs:
- `/tmp/pr.diff` — diff file written by the preceding gh CLI step
- `GITHUB_WORKSPACE` — repo root, passed as `rootDir` to `createReviewer`
- `PR_TITLE` — optional; passed as `prTitle` to `reviewer.review()`
- `OPENROUTER_API_KEY` — consumed by the provider inside `createReviewer`
- `GITHUB_OUTPUT` — path to the GitHub output file

Pass/fail rule: `passed = !result.findings.some(f => f.severity === 'error')`

Comment format (written to `/tmp/review-comment.md`):
```
## ✅ AI Code Review — Passed   (or ❌ … — Failed)

**PR:** <prTitle>\n\n   (omitted when prTitle is empty)
<result.summary>

### Criteria

| Criterion                      | Status |
|--------------------------------|--------|
| Security & Auth                | ✅/⚠️/❌ |
| Correctness & Edge Cases       | ✅/⚠️/❌ |
| TypeScript & Type Safety       | ✅/⚠️/❌ |
| Project Convention Compliance  | ✅/⚠️/❌ |
| Cloudflare Workers Compat.     | ✅/⚠️/❌ |

<details>
<summary>Findings (N)</summary>
- **[severity]** `file:line` — message
  > suggestion
</details>
```

When `result.findings` is empty, replace `<details>` block with `_No findings._`.

Criterion status derivation per row:
- any `error` finding with matching `criterion` → ❌
- any `warning` (no error) → ⚠️
- no findings or only `info` → ✅

Files written:
- `/tmp/review-comment.md` — full markdown comment
- `/tmp/review-result.json` — `JSON.stringify({ passed, label, ...result })`

`$GITHUB_OUTPUT` entries:
- `passed=<true|false>`
- `label=<ai-cr:passed|ai-cr:failed>`

### Success Criteria

#### Automated Verification

- `npx tsc --noEmit run-review.ts` (or `tsx --noEmit`) produces no type errors
- Action YAML is valid (`actionlint .github/actions/ai-code-review/action.yml` if available, or manual review)

#### Manual Verification

- Create a dummy `/tmp/pr.diff` with a small diff; run `GITHUB_WORKSPACE=$(pwd) OPENROUTER_API_KEY=<key> PR_TITLE="Test PR" tsx .github/actions/ai-code-review/run-review.ts`
- Confirm `/tmp/review-comment.md` renders correctly in a markdown previewer (badge, criteria table, findings)
- Confirm `/tmp/review-result.json` contains `passed`, `label`, `summary`, `findings` with `criterion` fields

**Implementation Note**: Smoke-test the runner locally before pushing. A local run catches schema mismatches and import path issues without consuming GH Actions minutes.

---

## Phase 3: Workflow

### Overview

Create the main GitHub Actions workflow that gates on PR events + label trigger, provisions labels, clears stale state, and calls the composite action.

### Changes Required

#### 1. AI code review workflow

**File**: `.github/workflows/ai-code-review.yml`

**Intent**: New workflow file triggered by `pull_request` activity types `[opened, synchronize, reopened, labeled]` targeting `main`. The job is skipped when the event is `labeled` for any label other than `ai-cr:review`. Three labels are provisioned on every run. All three review labels are removed from the PR at job start (clean slate). The composite action is called with PR context.

**Contract**:

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened, labeled]
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  ai-code-review:
    runs-on: ubuntu-latest
    if: github.event.action != 'labeled' || github.event.label.name == 'ai-cr:review'
```

Job steps in order:

**Step 1 — Provision labels** (`actions/github-script@v7`):
Call `github.rest.issues.createLabel` for each of the three labels with `.catch(() => {})`. Colors: `ai-cr:passed` → `#0e8a16` (green), `ai-cr:failed` → `#d93f0b` (red), `ai-cr:review` → `#e4e669` (yellow).

**Step 2 — Clean up stale review labels** (`actions/github-script@v7`):
Call `github.rest.issues.removeLabel` for each of the three labels using `context.issue.number` with `.catch(() => {})` on each.

**Step 3 — Run AI code review** (`uses: ./.github/actions/ai-code-review`):
Pass `pull-number: ${{ github.event.pull_request.number }}`, `github-token: ${{ secrets.GITHUB_TOKEN }}`, `openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}`, `pr-title: ${{ github.event.pull_request.title }}`.

#### 2. Add repository secret

**Location**: GitHub repository Settings → Secrets and variables → Actions

**Intent**: The `OPENROUTER_API_KEY` secret must be added to the repository before the workflow can run. This is a one-time manual setup step.

**Contract**: Secret name: `OPENROUTER_API_KEY`. Value: the OpenRouter API key from the project's credentials store.

### Success Criteria

#### Automated Verification

- Workflow YAML passes `actionlint` (or `gh workflow view` without errors)
- `OPENROUTER_API_KEY` secret is visible in repository secrets list

#### Manual Verification

- Open a test PR against `main` (can be a trivial change); confirm the `AI Code Review` workflow run appears in the PR's Checks section
- After the run, verify three labels exist in the repo's labels page (`ai-cr:passed`, `ai-cr:failed`, `ai-cr:review`)
- Verify the PR comment contains the badge, criteria table, and findings section
- Verify exactly one of `ai-cr:passed` / `ai-cr:failed` is applied to the PR
- Add the `ai-cr:review` label to the PR; verify a new workflow run triggers, all three labels are removed at run start, and a fresh result is posted

**Implementation Note**: The secret must be added before the first real PR is reviewed — the workflow will fail with a 401 from OpenRouter if it's missing. Confirm secret presence in repo settings before merging this change to `main`.

---

## Testing Strategy

### Unit Tests

No new unit tests required — the package has no test suite yet (`AGENTS.md` confirms this). The manual smoke-test of the runner script (Phase 2 manual verification) serves as the functional check.

### Integration Tests

The Phase 3 manual verification against a real PR is the integration test. Cover these scenarios:

1. **Clean first run** — PR opened with no existing labels → workflow runs, labels provisioned, comment created, result label applied
2. **Re-run via label** — `ai-cr:review` added after a previous result → all 3 labels removed, fresh review runs, new result applied
3. **Unrelated label added** — any label other than `ai-cr:review` → workflow job is skipped (visible as "Skipped" in Checks)
4. **Passing PR** — diff with no `error`-severity findings → `ai-cr:passed` label, ✅ badge

### Manual Testing Steps

1. Push the three phases as a single PR; add `OPENROUTER_API_KEY` secret to repo settings
2. Open a second test PR with a small valid change; observe the workflow run
3. Inspect the PR comment — verify criteria table columns align with `security`/`correctness`/`typescript`/`conventions`/`cloudflare`
4. Find a finding in the output; confirm it has a `criterion` value matching one of the five keys
5. Add `ai-cr:review` to the test PR; verify re-run and label reset
6. Introduce a deliberate security violation in a PR (e.g. `process.env.SUPABASE_URL`); verify it yields `ai-cr:failed` with a `security`-criterion `error`-severity finding

## Performance Considerations

- `anthropic/claude-haiku-4.5` via OpenRouter is the default model — cost-efficient for this use case
- `maxSteps: 10` caps the tool-loop iterations per review
- `npm ci` in the composite action installs only the `packages/code-review/` dependencies (~4 small packages); expect 10-20 seconds
- Label provisioning and cleanup add ~3 API calls per run; all are fast GH REST calls

## Migration Notes

No data migrations. The schema change (adding optional `criterion` field to `ReviewFinding`) is additive — existing callers of `review()` that don't use the field are unaffected.

## References

- Requirements: `context/changes/ci-cd-code-review/requairments.md`
- Research: `context/changes/ci-cd-code-review/research.md`
- Package entry: `packages/code-review/src/index.ts`
- Schema: `packages/code-review/src/schema.ts`
- Prompt: `packages/code-review/src/prompt.ts`
- Agent: `packages/code-review/src/agent.ts`
- Existing workflow: `.github/workflows/ci.yml`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Extend packages/code-review/src/

#### Automated

- [x] 1.1 `npm run lint` passes inside `packages/code-review/` — ca43d6a
- [x] 1.2 `npx tsc --noEmit` (or equivalent) passes inside `packages/code-review/` — ca43d6a
- [x] 1.3 `npm start` (demo) completes without runtime errors — ca43d6a

#### Manual

- [x] 1.4 Demo output includes `criterion` field on findings matching one of the five enum values — ca43d6a
- [x] 1.5 Prompt visibly references all five criterion keys — ca43d6a

### Phase 2: Composite Action

#### Automated

- [x] 2.1 Runner script has no TypeScript errors (`tsx --noEmit` or `tsc`)
- [x] 2.2 `action.yml` YAML is structurally valid

#### Manual

- [ ] 2.3 Local smoke-test of runner with dummy diff produces well-formed `/tmp/review-comment.md`
- [ ] 2.4 `/tmp/review-result.json` contains `passed`, `label`, `summary`, `findings` with `criterion` fields

### Phase 3: Workflow

#### Automated

- [x] 3.1 Workflow YAML passes `actionlint` or equivalent validation — YAML valid (python yaml / manual review; actionlint not installed)
- [ ] 3.2 `OPENROUTER_API_KEY` secret added to repository settings

#### Manual

- [ ] 3.3 Test PR triggers `AI Code Review` workflow run visible in Checks
- [ ] 3.4 Three labels provisioned in repo labels page after first run
- [ ] 3.5 PR comment appears with badge, criteria table, and findings section
- [ ] 3.6 Exactly one of `ai-cr:passed` / `ai-cr:failed` applied to the PR
- [ ] 3.7 `ai-cr:review` label triggers re-run; all labels cleared at start; fresh result posted
- [ ] 3.8 Unrelated label addition results in skipped workflow job

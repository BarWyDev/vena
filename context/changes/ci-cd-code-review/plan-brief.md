# CI/CD Automated AI Code Review — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Wire the existing `packages/code-review/` package into a GitHub Actions PR workflow so every pull request against `main` is automatically reviewed by an AI across five Vena-specific criteria. This replaces ad-hoc manual review for project conventions and security rules with a consistent, zero-setup gate that runs on every PR.

## Starting Point

`packages/code-review/` already exposes a working `createReviewer({ rootDir }).review(diff)` API returning `{ summary, findings[] }`. The prompt is generic (no Vena criteria), the schema has no per-criterion tagging, and the repo has no composite actions or label infrastructure.

## Desired End State

Every PR against `main` automatically gets an AI code review comment with a pass/fail badge, a five-row criteria status table (✅/⚠️/❌ per criterion), and a collapsible findings list. Either `ai-cr:passed` or `ai-cr:failed` is applied as a label. Adding `ai-cr:review` re-triggers the review on demand.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Scoring output format | Tag findings with `criterion` field (not numeric scores) | Enables per-criterion status table without full schema rework; numeric scores from LLMs are less reliable than severity judgments | Plan |
| Comment format | Badge + criteria table + collapsible findings | Gives at-a-glance status for passing PRs and actionable drill-down for failing ones | Plan |
| Runner script location | Co-located in `.github/actions/ai-code-review/` | Self-contained — action ships with its runner; no change to the package's public API | Plan |
| Label pre-creation | Workflow self-provisions via `createLabel --force` | Zero manual setup; no-op on repeated runs | Plan |
| Re-run cleanup | Remove all 3 labels at job start, add result at end | Clean slate per review; branchless logic (catch 404s from absent labels) | Plan |
| PR description input | Excluded from v1 | Marked as cost-tradeoff in requirements; diff is the ground truth | Research |
| Branch target | `main` (not `master`) | All existing CI targets `main`; "master" in requirements is a typo confirmed by research | Research |
| Event trigger | `pull_request` (not `pull_request_target`) | `pull_request_target` doesn't support `labeled` activity type | Research |

## Scope

**In scope:**
- `Criterion` enum + optional field on `ReviewFinding` in schema
- 5 Vena-specific criteria injected into `REVIEW_INSTRUCTIONS` in prompt
- PR title threaded into `buildReviewPrompt(diff, prTitle?)`
- Composite action: checkout → deps → diff fetch → tsx runner → comment + labels
- Workflow: label provisioning, stale-label cleanup, composite action call
- One new repository secret: `OPENROUTER_API_KEY`

**Out of scope:**
- Numeric per-criterion 1-10 scores
- PR description as prompt input
- Business alignment / architectural fit criteria
- Test suite for the code-review package
- Caching in the composite action

## Architecture / Approach

Three-file GH Actions setup: the composite action at `.github/actions/ai-code-review/` encapsulates all review logic (fetch diff → invoke tsx runner → post results), keeping the workflow file thin. The tsx runner imports directly from `packages/code-review/src/index.ts` via relative path and writes result files to `/tmp/` for downstream github-script steps to consume, avoiding `$GITHUB_OUTPUT` escaping issues for multiline markdown.

Pass/fail rule: any finding with `severity === 'error'` → `ai-cr:failed`; otherwise `ai-cr:passed`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Extend package | `Criterion` field on findings; 5 Vena criteria in prompt; `prTitle` threading | LLM criterion tagging reliability — verify with manual smoke test |
| 2. Composite action | `action.yml` + `run-review.ts`; comment markdown; label writes | Import path from runner to package (`../../../packages/code-review/src/`) must resolve after checkout |
| 3. Workflow | End-to-end PR flow; label provisioning; re-run via label | `OPENROUTER_API_KEY` secret must be added to repo settings before first real PR |

**Prerequisites:** `OPENROUTER_API_KEY` secret added to GitHub repo settings before Phase 3 manual verification.
**Estimated effort:** ~1 session across 3 phases; phases are independent enough to be implemented and tested sequentially.

## Open Risks & Assumptions

- LLM may not always populate `criterion` on every finding — the runner must handle `undefined` criterion gracefully (falls through to "no findings for this criterion" → ✅)
- `actionlint` is not currently in the repo's dev tooling — YAML validity is verified manually or via the GH Actions UI on first push
- The `gh pr diff` command in the composite action requires `GH_TOKEN` env to be set — the action passes `inputs.github-token` explicitly for this

## Success Criteria (Summary)

- Opening a PR against `main` triggers the `AI Code Review` workflow, posts a structured comment with the criteria table, and applies one of `ai-cr:passed` / `ai-cr:failed`
- Adding `ai-cr:review` triggers a fresh re-review with all stale labels cleared first
- A PR with a deliberate `process.env` usage for secrets receives `ai-cr:failed` with a `security`-criterion error finding

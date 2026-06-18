# Tool Loop Code-Review Agent — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

Convert `packages/code-review/src/index.ts` from a single-shot `generateText`
call into a modular, reusable code-review **agent** on the AI SDK v6
`ToolLoopAgent`. Per `change.md`, the reviewer should judge not just bugs but
consistency with project conventions (CLAUDE.md / AGENTS.md) and existing
patterns across the codebase — which requires the agent to read project files
during review. The schema and prompt are extracted into their own modules, and
the reviewer is exposed via a factory so a future promptfoo eval can consume it
unchanged.

## Starting Point

Today everything lives in one 107-line `index.ts`: provider factory, Zod
schemas, an inline system prompt, a single-shot `reviewCode()` (`generateText` +
`Output.object`, no tool loop), and a guarded `main()` demo. `ai` is v6.0.206;
`ToolLoopAgent`, `Output`, `tool`, `stepCountIs` are all available.

## Desired End State

`src/` is split into `schema.ts`, `provider.ts`, `prompt.ts`,
`tools/read-file.ts`, `agent.ts`, `demo.ts`, and a thin `index.ts` barrel.
`createReviewer({ model?, provider?, rootDir?, maxSteps? }).review(diff)` returns
a validated `ReviewResult` after the agent has optionally read convention files
via a confined `readFile` tool. `npm start` runs the demo; `npm run typecheck`
is clean. No eval environment ships.

## Key Decisions Made

| Decision        | Choice                                  | Why (1 sentence)                                                       | Source |
| --------------- | --------------------------------------- | ---------------------------------------------------------------------- | ------ |
| Tool surface    | One confined `readFile` tool            | Makes ToolLoopAgent meaningful and fulfills the convention-check intent with minimal surface. | Plan   |
| Module layout   | Flat `src/` split + `index.ts` barrel   | Matches a small standalone package; keeps index as the documented entry. | Plan   |
| Export shape    | Factory-only `createReviewer(...)`      | Cleanest DI for tests/evals; single injection point for promptfoo later. | Plan   |
| Read scope      | Configurable `rootDir`, escapes rejected| Safe by default in CI/evals; injectable to point at a fixture repo.    | Plan   |
| Output handling | `Output.object` + `stopWhen` on agent   | Tools + typed result from one `generate()` call; finite loop budget.   | Plan   |
| Config source   | Factory args, env-defaulted             | One place to override model/provider/root/steps; env reads at the edge. | Plan   |
| Demo entry      | Move to `src/demo.ts`                    | Keeps the smoke test; barrel stays side-effect-free.                   | Plan   |

## Scope

**In scope:** modular split (schema/provider/prompt/tool/agent/demo/barrel);
`ToolLoopAgent` with structured output; one confined `readFile` tool;
`createReviewer` factory; README + script updates.

**Out of scope:** promptfoo/eval wiring, datasets, assertions; `list`/`glob`
tools; streaming/`useChat`/UI; new dependencies; keeping the old `reviewCode()`.

## Architecture / Approach

`createReviewer(config)` resolves provider/model/rootDir/maxSteps (env defaults),
constructs a `ToolLoopAgent` with `instructions: REVIEW_INSTRUCTIONS`,
`tools: { readFile }`, `output: Output.object({ schema: ReviewResult })`, and
`stopWhen: stepCountIs(maxSteps)`. `review(diff)` builds the prompt via
`buildReviewPrompt(diff)`, calls `agent.generate()`, and returns `result.output`.
The `readFile` tool confines reads to `rootDir`, returning an error string (not a
throw) on path escape so the agent recovers inside the loop.

## Phases at a Glance

| Phase                          | What it delivers                                  | Key risk                                            |
| ------------------------------ | ------------------------------------------------- | --------------------------------------------------- |
| 1. Foundation modules          | schema.ts, provider.ts, prompt.ts (enriched)      | Instructions must actually drive tool use           |
| 2. Read-file tool              | `tools/read-file.ts`, confined to rootDir         | Path-confinement correctness (traversal/breakout)   |
| 3. Agent factory               | `createReviewer` → ToolLoopAgent + `review()`     | Correct `output`+`tools`+`stopWhen` wiring (v6 API) |
| 4. Barrel, demo & docs         | index barrel, demo.ts, scripts, README            | Keeping barrel side-effect-free; README accuracy    |

**Prerequisites:** `OPENROUTER_API_KEY` in `.env` for the live smoke test;
deps already installed (`ai` v6, `@openrouter/ai-sdk-provider`, `zod`).
**Estimated effort:** ~1 session across 4 small phases.

## Open Risks & Assumptions

- `Output.object` + `tools` on one agent works as documented in v6.0.206 (per
  reference docs); confirm via the Phase 3 smoke test.
- Removing `reviewCode()` is an accepted breaking change; only known consumers
  are the demo and README, both updated here.
- `inputSchema` (not `parameters`) is required for the tool in v6.

## Success Criteria (Summary)

- `createReviewer().review(diff)` returns a schema-valid `ReviewResult`.
- The agent reads CLAUDE.md/AGENTS.md within `rootDir` and is denied paths that
  escape it.
- `npm run typecheck` clean; `npm start` prints a validated review; README
  matches the factory API.

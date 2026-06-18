# Tool Loop Code-Review Agent Implementation Plan

## Overview

Convert `packages/code-review/src/index.ts` from a single-shot `generateText` +
`Output.object` call into a modular, reusable code-review **agent** built on the
AI SDK v6 `ToolLoopAgent`. The agent gains a confined `readFile` tool so it can
inspect project-convention files (CLAUDE.md / AGENTS.md) and related source
before emitting a Zod-validated `ReviewResult`. The structured-output schema and
the prompt/instructions are extracted into their own modules, and the package
exposes a `createReviewer({...})` factory so a future promptfoo eval can consume
the reviewer without touching this package.

## Current State Analysis

`packages/code-review/src/index.ts` (107 lines) does everything in one file:

- `createProvider(apiKey?)` — builds an OpenRouter provider, throws if no key.
- `Severity`, `ReviewFinding`, `ReviewResult` — Zod schemas + inferred types.
- `SYSTEM_PROMPT` — an inline const string.
- `reviewCode({ diff, model?, provider? })` — one `generateText` call with
  `output: Output.object({ schema: ReviewResult })`. **No tool loop**; this is a
  single-shot call, functionally unrelated to `ToolLoopAgent`.
- `main()` — a demo gated on `import.meta.url === file://${process.argv[1]}`.

Key environment facts (verified):

- `ai` is **v6.0.206**; runtime exports confirmed for `ToolLoopAgent`, `Output`,
  `tool`, `stepCountIs`, `hasToolCall`. `InferAgentUIMessage` is a type-only export.
- This is a **standalone Node package** (`tsx --env-file=.env`, `process.env`).
  The Astro `astro:env` hard rule does **not** apply here — `process.env` is correct.
- `tsconfig.json` uses `NodeNext` + `verbatimModuleSyntax: true` +
  `noUncheckedIndexedAccess: true`. Type-only re-exports must use
  `export type { ... }`; relative imports resolve fine without extensions under
  `tsx`, matching the current single-file style.
- Provider is `@openrouter/ai-sdk-provider`; default model constant is
  `anthropic/claude-haiku-4.5` in code (README mentions sonnet — README will be
  reconciled to whatever the code default is).

### Key Discoveries:

- `ToolLoopAgent` accepts `output: Output.object({ schema })` **together with**
  `tools` and `stopWhen` — the model calls tools across steps, then emits one
  validated object. `agent.generate({ prompt })` returns `{ output, text, steps }`
  (`node_modules/ai/docs/07-reference/01-ai-sdk-core/16-tool-loop-agent.mdx:460`).
- Default loop budget is `stopWhen: stepCountIs(20)`
  (`.../03-agents/02-building-agents.mdx:82`).
- Tool definition uses `tool({ description, inputSchema, execute })` — note
  `inputSchema`, **not** `parameters` (renamed in v6; see
  `.claude/skills/ai-sdk/references/common-errors.md`).
- Instructions go in the `instructions` constructor field (not a `system`
  message); raw `role: "system"` messages are rejected by default as an
  injection risk (`16-tool-loop-agent.mdx:58-63`).
- Skill convention is `lib/agents/*` + `lib/tools/*`; for this small package a
  flatter `src/` split is the chosen fit.

## Desired End State

`packages/code-review/src/` contains focused modules:

```
src/
  schema.ts          # Severity, ReviewFinding, ReviewResult (Zod + types)
  provider.ts        # createProvider(apiKey?) + DEFAULT_MODEL
  prompt.ts          # REVIEW_INSTRUCTIONS + buildReviewPrompt(diff)
  tools/
    read-file.ts     # createReadFileTool({ rootDir }) — confined file reads
  agent.ts           # createReviewer({...}) -> { agent, review(diff) }
  demo.ts            # runnable smoke test via createReviewer().review(sample)
  index.ts           # thin barrel: re-exports factory, schemas, types, provider
```

Verification: `npm run typecheck` passes; `npm start` runs the demo and prints a
validated `ReviewResult`; `createReviewer(...).review(diff)` returns a typed,
schema-valid object; the agent can call `readFile` to read CLAUDE.md/AGENTS.md
within `rootDir` and is denied paths that escape it.

## What We're NOT Doing

- **No promptfoo / eval environment** — no provider adapter file, no
  `promptfooconfig.yaml`, no test datasets, no assertions. The factory export is
  designed so that work is additive later, but none of it ships here.
- **No `list`/`glob` tool** — only a single `readFile` tool this change.
- **Not preserving the old `reviewCode()` function** — it is replaced by the
  `createReviewer` factory (a deliberate API change; README updated to match).
- **No streaming / `useChat` / UI integration** — `.review()` uses
  `generate()` only.
- **No new dependencies** and no change to provider (`@openrouter/ai-sdk-provider`).
- **No model-default change** beyond reconciling README with the code constant.

## Implementation Approach

Build bottom-up so each phase typechecks on its own: extract the leaf modules
(schema, provider, prompt) first, then the tool, then the agent factory that
composes them, then the barrel + demo + docs. The factory is the single
injection point (model, provider, rootDir, maxSteps) so tests and a future eval
can swap the model/provider and point `rootDir` at a fixture repo. Structured
output is produced by the agent itself via `output: Output.object` so the tool
loop and the typed result come from one `generate()` call.

## Critical Implementation Details

- **Tool input schema uses `inputSchema`, not `parameters`** — `parameters` is a
  deprecated v5 name that silently fails to validate in v6.
- **Path confinement is security-load-bearing**: the `readFile` tool will run in
  CI/evals. Resolve the requested path against `rootDir`, normalize it, and
  reject anything whose resolved absolute path is not inside the resolved
  `rootDir` (covers `..` traversal and absolute-path breakout). On rejection or
  missing file, **return** an error string the model can read — do not throw —
  so the agent can recover within the loop.
- **`output` + `tools` coexist on the agent**: keep a finite `stopWhen`
  (`stepCountIs(maxSteps)`, default ~10) so a misbehaving loop terminates; read
  the typed result from `result.output`.

## Phase 1: Foundation Modules (schema, provider, prompt)

### Overview

Extract the schema, provider, and prompt out of `index.ts` into standalone
modules. Enrich the instructions to reflect the change.md intent (convention &
codebase-consistency review, guidance to use the readFile tool) and add a diff
prompt builder.

### Changes Required:

#### 1. Schema module

**File**: `packages/code-review/src/schema.ts`

**Intent**: Move `Severity`, `ReviewFinding`, `ReviewResult` (Zod schemas + their
inferred types) out of `index.ts` verbatim so the schema is independently
importable by the agent and by a future eval.

**Contract**: Named exports `Severity`, `ReviewFinding`, `ReviewResult` (Zod
schemas) and the matching inferred `type` exports of the same names. No behavior
change to the schemas.

#### 2. Provider module

**File**: `packages/code-review/src/provider.ts`

**Intent**: Move `createProvider(apiKey?)` and introduce a `DEFAULT_MODEL`
constant (env-overridable) so the agent factory has one place to resolve model
and provider.

**Contract**: `export function createProvider(apiKey = process.env.OPENROUTER_API_KEY)`
(unchanged throw-on-missing-key behavior) and `export const DEFAULT_MODEL: string`.
`DEFAULT_MODEL` resolves from `process.env.OPENROUTER_MODEL` falling back to the
package default model id.

#### 3. Prompt module

**File**: `packages/code-review/src/prompt.ts`

**Intent**: Extract the system prompt as agent `instructions`, enriched per the
change.md intent — review for correctness AND consistency with project
conventions (CLAUDE.md / AGENTS.md), existing patterns/libraries/style, not just
bugs — plus explicit guidance to use the `readFile` tool to consult those
convention files and related source before finalizing. Add a builder for the
user-facing diff prompt.

**Contract**: `export const REVIEW_INSTRUCTIONS: string` and
`export function buildReviewPrompt(diff: string): string` (returns the
"Review the following diff…" message wrapping the diff). Instructions must
mention that a `readFile` tool is available and should be used to verify
convention/consistency claims.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck` (from `packages/code-review`)
- New files exist: `src/schema.ts`, `src/provider.ts`, `src/prompt.ts`

#### Manual Verification:

- `REVIEW_INSTRUCTIONS` reads as coherent guidance covering bugs + convention/
  codebase consistency + tool usage.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for human confirmation before proceeding.

---

## Phase 2: Read-File Tool

### Overview

Add a single AI SDK tool that lets the agent read files confined to a
configurable repository root.

### Changes Required:

#### 1. Read-file tool

**File**: `packages/code-review/src/tools/read-file.ts`

**Intent**: Provide a factory that returns a `tool({...})` bound to a `rootDir`.
The tool reads a UTF-8 file relative to `rootDir`, after verifying the resolved
path stays inside `rootDir`; on traversal/absolute breakout or read failure it
returns a descriptive error string (does not throw) so the agent can adapt.

**Contract**: `export function createReadFileTool(opts: { rootDir: string }): Tool`.
Tool `description` explains it reads project files (e.g. CLAUDE.md, AGENTS.md,
source) relative to the repo root. `inputSchema` = `z.object({ path: z.string()
.describe('Repo-relative path to read') })` (use `inputSchema`, not
`parameters`). `execute` resolves `path` against `rootDir`, rejects escapes,
returns file contents string or an `Error: …` string.

**Contract (path confinement)** — the one non-obvious bit:

```ts
const root = path.resolve(rootDir);
const target = path.resolve(root, requestedPath);
if (target !== root && !target.startsWith(root + path.sep)) {
  return `Error: path "${requestedPath}" is outside the allowed root.`;
}
```

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- File exists: `src/tools/read-file.ts`

#### Manual Verification:

- Reading an in-root file (e.g. `AGENTS.md`) returns its contents.
- Reading `../../etc/passwd` or an absolute path returns the confinement error,
  not file contents.

**Implementation Note**: Pause for human confirmation before proceeding.

---

## Phase 3: Agent Factory

### Overview

Compose the provider, instructions, schema, and tool into a `ToolLoopAgent`
behind a `createReviewer` factory that returns the agent plus a typed
`review(diff)` method.

### Changes Required:

#### 1. Reviewer factory / agent

**File**: `packages/code-review/src/agent.ts`

**Intent**: Build a configured `ToolLoopAgent` with structured output, the
readFile tool, and a finite step budget; expose a `review(diff)` convenience that
assembles the prompt, runs `generate()`, and returns the validated
`ReviewResult`. All knobs are injectable for tests/evals and default from env.

**Contract**:
`export interface ReviewerConfig { model?: string; provider?: ReturnType<typeof createProvider>; rootDir?: string; maxSteps?: number }`
and `export function createReviewer(config?: ReviewerConfig): { agent: ToolLoopAgent; review(diff: string): Promise<ReviewResult> }`.

Behavior:
- `provider` defaults to `createProvider()`; `model` defaults to `DEFAULT_MODEL`;
  `rootDir` defaults to `process.cwd()`; `maxSteps` defaults to ~10.
- Agent config: `model: provider(model)`, `instructions: REVIEW_INSTRUCTIONS`,
  `tools: { readFile: createReadFileTool({ rootDir }) }`,
  `output: Output.object({ schema: ReviewResult })`,
  `stopWhen: stepCountIs(maxSteps)`.
- `review(diff)` = `const { output } = await agent.generate({ prompt: buildReviewPrompt(diff) }); return output;`

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- File exists: `src/agent.ts`; `createReviewer` and `ReviewerConfig` are exported.

#### Manual Verification:

- `createReviewer().review(sampleDiff)` returns an object matching `ReviewResult`
  (summary + findings).

**Implementation Note**: Pause for human confirmation before proceeding.

---

## Phase 4: Barrel, Demo & Docs

### Overview

Make `index.ts` a thin barrel, move the runnable demo to its own file, wire the
`npm start` script, and reconcile the README with the new factory API.

### Changes Required:

#### 1. Barrel

**File**: `packages/code-review/src/index.ts`

**Intent**: Replace the old monolith with re-exports so the package has one clean
public surface and no runnable side effects on import.

**Contract**: Re-export `createReviewer`, `ReviewerConfig` (type) from `./agent`;
`createProvider`, `DEFAULT_MODEL` from `./provider`; `Severity`, `ReviewFinding`,
`ReviewResult` (schemas + types) from `./schema`. Use `export type { … }` for
type-only names (verbatimModuleSyntax). No `main()` / no top-level execution.

#### 2. Demo entry

**File**: `packages/code-review/src/demo.ts`

**Intent**: House the smoke test previously in `main()`, now driving the factory.

**Contract**: A `main()` that builds the sample diff, calls
`createReviewer().review(sampleDiff)`, logs JSON, and is guarded by
`import.meta.url === \`file://${process.argv[1]}\`` with the existing
`process.exitCode = 1` error handling.

#### 3. Script wiring

**File**: `packages/code-review/package.json`

**Intent**: Point the run scripts at the demo file so `npm start` / `npm run dev`
still smoke-test the reviewer.

**Contract**: `start` → `tsx --env-file=.env src/demo.ts`; `dev` →
`tsx --env-file=.env watch src/demo.ts`. `main` field stays `src/index.ts`.

#### 4. README

**File**: `packages/code-review/README.md`

**Intent**: Document the factory API and the new module layout; replace the
`reviewCode` "Use as a library" section.

**Contract**: "Use as a library" shows `import { createReviewer } from './src/index.ts'`,
`const reviewer = createReviewer({ rootDir });`, `await reviewer.review(diff)`.
List exports: `createReviewer`, `createProvider`, `DEFAULT_MODEL`, `ReviewResult`/
`ReviewFinding`/`Severity`. Reconcile the documented default model with
`DEFAULT_MODEL`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- `src/demo.ts` and barrel `src/index.ts` exist; old `main()`/`reviewCode` gone
  from `index.ts`.

#### Manual Verification:

- `npm start` (with `OPENROUTER_API_KEY` set) prints a validated `ReviewResult`.
- README examples match the actual exported API.

**Implementation Note**: Pause for human confirmation; this completes the change.

---

## Testing Strategy

### Unit Tests:

- None added this change (no test runner configured in the package). Path
  confinement and factory wiring are verified manually per phase criteria.

### Integration Tests:

- `npm start` exercises factory → agent → tool → structured output end-to-end
  against the live provider.

### Manual Testing Steps:

1. `cd packages/code-review && npm run typecheck` — clean.
2. With `OPENROUTER_API_KEY` set, `npm start` — prints summary + findings JSON.
3. Temporarily log `readFile` calls (or inspect `result.steps`) to confirm the
   agent consults AGENTS.md/CLAUDE.md within `rootDir`.
4. Request an out-of-root path via a crafted diff/prompt and confirm the tool
   returns the confinement error rather than file contents.

## Performance Considerations

The tool loop makes multiple model round-trips (one per step) vs. the old
single call; `stopWhen: stepCountIs(maxSteps)` (~10) caps cost/latency. This is
an intentional tradeoff for codebase-aware review.

## Migration Notes

`reviewCode()` is removed in favor of `createReviewer().review()`. The only known
consumer is `main()`/the README, both updated here. Any external caller must
switch from `reviewCode({ diff })` to `createReviewer().review(diff)`.

## References

- Change notes: `context/changes/tool-loop-agent/change.md`
- AI SDK skill: `packages/code-review/.claude/skills/ai-sdk/SKILL.md`
- ToolLoopAgent reference: `node_modules/ai/docs/07-reference/01-ai-sdk-core/16-tool-loop-agent.mdx`
- Building agents: `node_modules/ai/docs/03-agents/02-building-agents.mdx`
- Tool param rename: `.claude/skills/ai-sdk/references/common-errors.md`
- Type-safe agents / file conventions: `.claude/skills/ai-sdk/references/type-safe-agents.md`
- Current implementation: `packages/code-review/src/index.ts:1-107`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation Modules (schema, provider, prompt)

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 New files exist: `src/schema.ts`, `src/provider.ts`, `src/prompt.ts`

#### Manual

- [x] 1.3 REVIEW_INSTRUCTIONS covers bugs + convention/codebase consistency + tool usage

### Phase 2: Read-File Tool

#### Automated

- [ ] 2.1 Type checking passes: `npm run typecheck`
- [ ] 2.2 File exists: `src/tools/read-file.ts`

#### Manual

- [ ] 2.3 In-root file read returns contents
- [ ] 2.4 Out-of-root / absolute path returns the confinement error

### Phase 3: Agent Factory

#### Automated

- [ ] 3.1 Type checking passes: `npm run typecheck`
- [ ] 3.2 `src/agent.ts` exists; `createReviewer` + `ReviewerConfig` exported

#### Manual

- [ ] 3.3 `createReviewer().review(sampleDiff)` returns a valid ReviewResult

### Phase 4: Barrel, Demo & Docs

#### Automated

- [ ] 4.1 Type checking passes: `npm run typecheck`
- [ ] 4.2 `src/demo.ts` + barrel `src/index.ts` exist; old `main()`/`reviewCode` removed from index
- [ ] 4.3 `package.json` start/dev scripts point at `src/demo.ts`

#### Manual

- [ ] 4.4 `npm start` prints a validated ReviewResult
- [ ] 4.5 README examples match the exported factory API

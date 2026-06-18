<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Tool Loop Code-Review Agent

- **Plan**: context/changes/tool-loop-agent/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-06-18
- **Verdict**: APPROVED (findings fixed during triage)
- **Findings**: 1 critical, 4 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS (after fixes) |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING (2.3, 2.4 manual items not confirmed) |

## Findings

### F1 — Symlink escape bypasses path confinement

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/tools/read-file.ts:17–19
- **Detail**: `path.resolve()` is lexical-only; symlinks inside rootDir pointing outside pass the prefix check, allowing reads of external files.
- **Fix**: Use `realpath()` on both root and target before comparing; catch ENOENT and surface as existing error-string.
- **Decision**: FIXED — realpath applied to both root and target in execute()

### F2 — Root not realpathed at construction

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/tools/read-file.ts:7
- **Detail**: `resolve(opts.rootDir)` lexically normalises but doesn't follow symlinks on the root itself. Pairs with F1.
- **Fix**: Realpath root inside execute (bundled with F1 fix).
- **Decision**: FIXED — bundled with F1

### F3 — `output as ReviewResult` bypasses runtime validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/agent.ts:33
- **Detail**: Unsafe cast silently passes undefined/partial output from the agent to the caller.
- **Fix**: Replace with `ReviewResult.parse(output)`.
- **Decision**: FIXED

### F4 — No handling for prompt injection via diff content

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/prompt.ts:19
- **Detail**: Diff interpolated directly; crafted diffs can inject adversarial instructions reaching the readFile tool.
- **Fix A ⭐ Recommended**: Wrap diff in `<diff>...</diff>` XML tags.
- **Decision**: FIXED via Fix A

### F5 — Shared ToolLoopAgent instance: stateful across review() calls?

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/agent.ts:22–36
- **Detail**: Reusing the instance is safe if generate() is stateless per call (confirmed for AI SDK v6).
- **Fix**: Add comment documenting the stateless contract.
- **Decision**: FIXED — comment added

### F6 — maxSteps exceeded produces silent incomplete output

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/agent.ts:27
- **Detail**: Covered by the F3 fix — ReviewResult.parse() throws a clear Zod error on incomplete output.
- **Decision**: SKIPPED — covered by F3

### F7 — `"main"` field points to TypeScript source

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: package.json:7
- **Detail**: Works only with tsx. Private package, so no publish risk.
- **Decision**: SKIPPED — private package, tsx-only usage is acceptable

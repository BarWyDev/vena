## Overall concept

- GHA workflow run for every new pull request to master
- composite action for the review itself so that main workflow is easy to reason about

## Input parameters

- pull request title
- pull request description (?? cost tradeoff)
- git diff

## Code Review Criteria

Each criterion is scored on a 1–10 scale, where 1 is the worst outcome and 10 is the best.

### 1. Security & Auth (weight: critical)
Does the diff handle auth and secrets correctly?
- 10 — env vars read exclusively via `astro:env/server`; user identity taken from `context.locals.user` (never `supabase.auth.getUser()` inside pages/components); Supabase client null-checked before every use; new routes added to `PROTECTED_ROUTES` in `middleware.ts`.
- 5 — one minor deviation (e.g. direct `supabase.auth.getUser()` call) with no real attack surface.
- 1 — secrets read from `process.env`, unauthenticated access to protected data, or missing null-check on the Supabase client.

### 2. Correctness & Edge Cases (weight: high)
Are there logic bugs, unhandled error paths, or missing validations?
- 10 — all branches handled; API routes redirect on error (never return raw JSON errors); async errors are caught; form inputs are validated.
- 5 — edge case missed but unlikely in practice; non-critical error path swallowed.
- 1 — crash-level bug, silent data loss, or unchecked user input reaching the database.

### 3. TypeScript & Type Safety (weight: high)
Is the code fully typed without unsafe escape hatches?
- 10 — no `any`, no non-null assertions (`!`) on values that could legitimately be null; Zod schemas used at runtime boundaries; inferred types preferred over manual annotations.
- 5 — one `any` or `!` with a justifiable reason.
- 1 — widespread `any`, type-cast chains that hide real type errors, or runtime type mismatches.

### 4. Project Convention Compliance (weight: medium)
Does the diff follow the patterns enforced in `AGENTS.md` / `CLAUDE.md`?
- 10 — correct path alias (`@/`); shadcn/ui primitives used for new UI; `lucide-react` icons; Tailwind v4 only (no inline `style`); React Compiler lint rules respected (no suppressed errors); imports consistent with existing patterns.
- 5 — minor style deviation (e.g. one missing alias) that doesn't affect runtime.
- 1 — bypasses React Compiler rules, introduces a new UI library, or breaks the path alias convention throughout.

### 5. Cloudflare Workers Compatibility (weight: medium)
Does the code run correctly in the Cloudflare workerd runtime?
- 10 — no Node.js-only APIs (`fs`, `path`, `crypto` module, `Buffer` without polyfill); SSR data-fetching done in `.astro` frontmatter or API routes, not client components; no global mutable state.
- 5 — uses a Node API that happens to be polyfilled by wrangler but isn't guaranteed.
- 1 — uses `fs`, `process.cwd()`, or other APIs that hard-crash in workerd.

## Parked for later

- business alignment (require broader context)
- architectural fit (require broader context)

## Expected side-effects

- PR comment with summary
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green)

## Expected behavior

- on-demand retry when label `ai-cr:review` is added
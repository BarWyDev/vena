# Repository Guidelines

Vena is a blood donation tracker PWA (Polish-language MVP) built on Astro v6 SSR + React v19 + TypeScript + Tailwind v4 + Supabase Auth, deployed to Cloudflare Workers.

## Hard Rules

- **Never use `process.env` for env vars.** Import from `astro:env/server` only — schema declared in `@astro.config.mjs`.
- **Never call `supabase.auth.getUser()` inside pages or components.** Read `context.locals.user` set by `src/middleware.ts`.
- **Always null-check the Supabase client.** `createClient()` in `@/lib/supabase.ts` returns `null` when env vars are absent.
- **API route errors redirect, they do not return JSON.** Pattern: `context.redirect('/path?error=…')`.
- **To protect a new route, add its path to `PROTECTED_ROUTES`** in `src/middleware.ts`.

## Project Structure

Source lives under `src/`: `pages/` (Astro pages; `api/auth/` holds form-action API routes), `components/` (Astro `.astro` and React `.tsx`; `ui/` for shadcn/ui primitives), `lib/` (Supabase client factory + shared utils), `layouts/`, and `middleware.ts`.

Path alias `@/` maps to `./src/` — use it for all intra-project imports.

## Commands

- `npm run dev` — dev server (Cloudflare workerd runtime)
- `npm run build` — production build
- `npm run lint` — ESLint with type-checked rules
- `npm run lint:fix` — auto-fix ESLint issues
- `npm run format` — Prettier

No test suite is configured yet.

## Coding Style & Conventions

- React Compiler (`eslint-plugin-react-compiler`) is enforced at error level — do not suppress its lint rules.
- UI primitives use shadcn/ui (new-york style) with `lucide-react` icons. See `@components.json`.
- Tailwind v4 via `@tailwindcss/vite`; class order is enforced by `prettier-plugin-tailwindcss`.
- Unused variables must be prefixed with `_` to pass ESLint.

## Commit & PR Guidelines

No commit prefix convention is established yet (single commit in history). Use verb-first imperative subject: `Add donation form`, `Fix auth redirect`.

CI runs lint + build on every push/PR to `master` — both must pass before merging. See `@.github/workflows/ci.yml`.

## Security & Configuration

- Local dev secrets: copy `.env.example` → `.dev.vars`. Cloudflare workerd reads `.dev.vars`, not `.env`.
- Production: set `SUPABASE_URL` and `SUPABASE_KEY` as Cloudflare secrets (`npx wrangler secret put`). Both are also required as GitHub repository secrets for CI.

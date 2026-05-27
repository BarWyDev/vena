---
bootstrapped_at: 2026-05-27T17:56:59Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: vena
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: vena
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

**Why this stack** (from hand-off body):

Vena is a solo, after-hours blood-donation eligibility PWA targeting a 3-week MVP where the calculator's dates must be correct per RCKiK rules — so the priority is a battle-tested, agent-friendly stack that handles auth and a private per-account database without hand-rolling. 10x-astro-starter is the recommended default for `(web, js)` and clears all four agent-friendly gates; TypeScript with explicit Zod schemas at boundaries directly supports the correctness-critical interval logic, and Supabase covers email/password auth (FR-001/002) plus row-private donation history. Cloudflare Pages is the starter default for edge deploy, CI on GitHub Actions with auto-deploy-on-merge fits a solo builder. Payments, realtime, AI, and background jobs are all out of scope per the PRD. One flagged gap: PWA install + offline (FR-011) is not shipped by the starter — it's a deliberate service-worker add during bootstrapping. Bootstrapper confidence is first-class, so scaffolding should be mostly smooth with occasional manual steps.

## Pre-scaffold verification

| Signal       | Value                                                       | Severity | Notes                                            |
| ------------ | ----------------------------------------------------------- | -------- | ------------------------------------------------ |
| npm package  | not run                                                     | n/a      | cmd_template starts with `git clone`; no npm CLI |
| GitHub repo  | przeprogramowani/10x-astro-starter last pushed 2026-05-17   | fresh    | from card.docs_url; within last 3 months         |

Note: `gh` CLI not installed; recency obtained via GitHub REST API (`api.github.com/repos/...`) as a read-only fallback.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: CLAUDE.md → CLAUDE.md.scaffold
**.gitignore handling**: moved silently (no .gitignore existed in cwd)
**.bootstrap-scaffold cleanup**: deleted (.git/ removed before move-up so upstream history did not leak)

Files moved up into cwd: `.env.example`, `.github/`, `.gitignore`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `public/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`, plus `CLAUDE.md` sidelined as `CLAUDE.md.scaffold`. The cwd `context/` directory was preserved untouched (scaffold shipped no `context/`).

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW (10 total)
**Direct vs transitive**: CRITICAL 0/0 · HIGH 0 direct of 1 · MODERATE 2 direct of 9 · LOW 0/0. The single HIGH is transitive; the two direct MODERATE entries (`@astrojs/check`, `wrangler`) are flagged only because of vulnerable transitive deps.

#### CRITICAL findings

None.

#### HIGH findings

- **devalue** (range 5.6.3–5.8.0) — transitive. DoS via sparse array deserialization. CVSS 7.5 (CWE-770). Advisory: GHSA-77vg-94rm-hx3p. No direct fix pinned; resolves when the upstream dependency bumps devalue.

#### MODERATE findings

Root causes are `ws` and `yaml`; the rest are flagged transitively through them.

- **ws** — transitive. Uninitialized memory disclosure. Advisory: GHSA-58qx-3vcg-4xpx.
- **yaml** — transitive. Stack overflow via deeply nested YAML collections. Advisory: GHSA-48c2-rrv3-qjmp.
- **@astrojs/check** — direct. Flagged via `@astrojs/language-server`.
- **@astrojs/language-server** — transitive. Via `volar-service-yaml`.
- **@cloudflare/vite-plugin** — transitive. Via `miniflare`, `wrangler`, `ws`.
- **miniflare** — transitive. Via `ws`.
- **volar-service-yaml** — transitive. Via `yaml-language-server`.
- **wrangler** — direct. Flagged via `miniflare`.
- **yaml-language-server** — transitive. Via `yaml`.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value             |
| ----------------------- | ----------------- |
| bootstrapper_confidence | first-class       |
| quality_override        | false             |
| path_taken              | standard          |
| self_check_answers      | null              |
| team_size               | solo              |
| deployment_target       | cloudflare-pages  |
| ci_provider             | github-actions    |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true              |
| has_payments            | false             |
| has_realtime            | false             |
| has_ai                  | false             |
| has_background_jobs     | false             |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review the `CLAUDE.md.scaffold` sibling the conflict policy created and decide whether to merge the starter's guidance into your existing `CLAUDE.md`.
- Address audit findings per your project's risk tolerance — all 10 are transitive-rooted (`devalue`, `ws`, `yaml`); none are direct CRITICAL/HIGH. `npm audit fix` may clear several once upstream bumps land.
- PWA install + offline (FR-011) is not shipped by this starter — plan the service-worker add as a deliberate follow-up.

---
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
---

## Why this stack

Vena is a solo, after-hours blood-donation eligibility PWA targeting a 3-week MVP where the calculator's dates must be correct per RCKiK rules — so the priority is a battle-tested, agent-friendly stack that handles auth and a private per-account database without hand-rolling. 10x-astro-starter is the recommended default for `(web, js)` and clears all four agent-friendly gates; TypeScript with explicit Zod schemas at boundaries directly supports the correctness-critical interval logic, and Supabase covers email/password auth (FR-001/002) plus row-private donation history. Cloudflare Pages is the starter default for edge deploy, CI on GitHub Actions with auto-deploy-on-merge fits a solo builder. Payments, realtime, AI, and background jobs are all out of scope per the PRD. One flagged gap: PWA install + offline (FR-011) is not shipped by the starter — it's a deliberate service-worker add during bootstrapping. Bootstrapper confidence is first-class, so scaffolding should be mostly smooth with occasional manual steps.

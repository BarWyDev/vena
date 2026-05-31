# First Deploy — Vena to Cloudflare Workers

## Context

First production deployment of Vena. The stack (Astro v6 SSR + @astrojs/cloudflare v13 + Supabase auth) is already configured for Cloudflare Workers in `wrangler.jsonc`. Two bugs in the current config must be fixed before deploying, and the CI/CD pipeline needs to be updated (currently triggers on `master`; canonical branch is `main`). Supabase cloud project is ready with credentials.

---

## Step 1 — Fix `wrangler.jsonc`

Two changes:

| Field | Current | New | Reason |
|---|---|---|---|
| `name` | `"10x-astro-starter"` | `"vena"` | Workers URL becomes `vena.<account>.workers.dev` |
| `compatibility_flags` | `["nodejs_compat"]` | `["nodejs_compat", "disable_nodejs_process_v2"]` | Fixes active Astro v6 + middleware rendering bug (GitHub #15434): without this flag, `context.locals.user` silently becomes `[object Object]` in SSR pages |

Result:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "vena",
  "main": "@astrojs/cloudflare/entrypoints/server",
  "compatibility_date": "2026-05-08",
  "compatibility_flags": ["nodejs_compat", "disable_nodejs_process_v2"],
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist",
    "not_found_handling": "404-page",
  },
  "observability": {
    "enabled": true,
  },
}
```

---

## Step 2 — Update `.github/workflows/ci.yml`

Two changes to the existing file:
1. `branches: [master]` → `branches: [main]` in both `push` and `pull_request` triggers
2. Add a `deploy` job (runs on push to `main` only, depends on `ci` passing)

Final workflow:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx astro sync
      - run: npm run lint
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}

  deploy:
    name: Deploy to Cloudflare Workers
    needs: ci
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx astro sync
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

---

## Step 3 — Manual Gate A: Wrangler CLI setup (user runs)

Wrangler is already installed as a dev dependency (`wrangler ^4.90.0` in `package.json`) — no global install needed.

**Verify the CLI works:**
```bash
npx wrangler --version
# Expected: wrangler 4.x.x
```

**Authenticate with Cloudflare (browser-based OAuth):**
```bash
npx wrangler login
```
A browser tab opens to `dash.cloudflare.com`. Log in and click **Allow**. The token is saved to `~/.config/.wrangler/config.json` — valid for the current machine, no expiry by default.

**Confirm authentication succeeded:**
```bash
npx wrangler whoami
# Expected: You are logged in with an OAuth Token, associated with the email <your@email.com>.
```

If `whoami` returns an error, re-run `wrangler login`. This must succeed before any `wrangler secret put` or `wrangler deploy` calls in Step 6.

---

## Step 4 — Manual Gate B: Cloudflare API token for CI (user does in browser)

This token lets GitHub Actions call `wrangler deploy` without interactive login.

**Create the token:**
1. Go to: `https://dash.cloudflare.com/profile/api-tokens`
2. Click **Create Token** → choose the **"Edit Cloudflare Workers"** template
3. Under **Permissions**, verify these are pre-filled:
   - Account → Workers Scripts → Edit
   - Account → Workers Scripts → Read
4. Under **Account Resources**, set to: **All accounts** (or select your specific account)
5. Under **Zone Resources**, set to: **None** (no custom domain for this deploy)
6. Click **Continue to summary** → **Create Token**
7. **Copy the token value** — it is shown exactly once; copy it now

**Find your Account ID:**
- Go to: `https://dash.cloudflare.com` → Workers & Pages
- Your **Account ID** appears in the right sidebar under "Account details"
- Copy it (format: 32-character hex string)

**Add both to GitHub repository secrets:**
1. Go to: `https://github.com/<owner>/vena/settings/secrets/actions`
2. Click **New repository secret** and add:
   - `CLOUDFLARE_API_TOKEN` = (token from above)
   - `CLOUDFLARE_ACCOUNT_ID` = (account ID from above)
3. Confirm these are also present (required by the `ci` build step):
   - `SUPABASE_URL`
   - `SUPABASE_KEY`

---

## Step 5 — Manual Gate C: Supabase project configuration (user does in browser)

### 5a — Get your credentials

1. Go to: `https://supabase.com/dashboard` → select your project
2. Click **Project Settings** (gear icon, bottom-left) → **API**
3. Note two values:
   - **Project URL** → this is `SUPABASE_URL` (format: `https://<project-ref>.supabase.co`)
   - **Project API Keys → anon / public** key → this is `SUPABASE_KEY`

These are the values you will paste when running `wrangler secret put` in Step 6 and that should already be in GitHub Secrets from the CI setup.

### 5b — Enable Email auth provider

1. In your project: **Authentication** (left sidebar) → **Providers**
2. Find **Email** → click to expand → toggle **Enable Email provider** to ON
3. Under the Email provider settings:
   - **Confirm email**: leave **ON** (Vena's signup flow sends a confirmation link)
   - **Secure email change**: leave ON
   - **Minimum password length**: 8 (default is fine)
4. Click **Save**

### 5c — Configure redirect URLs

Email confirmation links generated by Supabase must be allowed to redirect back to Vena.

1. **Authentication** → **URL Configuration**
2. Under **Redirect URLs**, click **Add URL** and add:
   ```
   https://*.workers.dev/**
   ```
   This wildcard allows the confirmation link to redirect to any `workers.dev` subdomain (needed before the exact URL is known from Step 6)
3. **Site URL** — leave blank for now; set it after the first deploy (Step 6 produces the exact URL)

### 5d — SMTP (email delivery) — optional but recommended

By default Supabase uses its own shared SMTP server with a rate limit of 3 emails/hour per project (sufficient for development; add a custom SMTP provider before going public).

To check the current sender address: **Authentication** → **Email Templates** — the default `From` address is `noreply@mail.app.supabase.io`.

---

## Step 6 — Set Workers secrets and deploy (agent executes)

After Gates A (wrangler auth confirmed), B (GitHub secrets set), and C (Supabase configured) are all done:

```bash
# Set production secrets (each prompts for the value — paste, Enter)
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY

# Build and deploy
npm run build
npx wrangler deploy
```

Expected output:
```
Deployed vena triggers (X.XX sec)
  https://vena.<account>.workers.dev
```

Capture the URL — go back to Step 5c and set **Site URL** to this exact value, then smoke test.

---

## Step 7 — Verification

**Automated:**
```bash
npx wrangler tail --format pretty
```
Leave running while smoke-testing. Watch for 5xx errors or CPU-time warnings.

**Smoke test sequence (user in browser):**
1. Open `https://vena.<account>.workers.dev` — homepage loads
2. Navigate to `/auth/signup` — form renders
3. Register with a test email
4. Confirm via email link — redirects back to app without 404
5. Sign in at `/auth/signin`
6. Verify `/dashboard` loads (protected route guard working — middleware fix confirmed)
7. Sign out — redirects to signin

**Pass criteria:** All 7 steps complete without errors; no 5xx in `wrangler tail`.

---

## What this deploy covers / does not cover

| Covered | Not covered |
|---|---|
| Auth routes: signin, signup, confirm-email | Custom domain |
| Protected route: /dashboard | PR preview environments |
| Supabase email+password auth | Logpush / persistent log drain |
| Auto-deploy on push to `main` via CI | Donation CRUD (not built yet) |

## Critical files modified

| File | Change |
|---|---|
| `wrangler.jsonc` | Worker name (`10x-astro-starter` → `vena`) + compatibility flag fix |
| `.github/workflows/ci.yml` | Branch rename (`master` → `main`) + deploy job added |
| `context/deployment/deploy-plan.md` | Created — this file |

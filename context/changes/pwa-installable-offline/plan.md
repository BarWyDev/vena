# PWA Installable + Offline — Implementation Plan

## Overview

Implement FR-011: make Vena installable as a PWA on mobile and usable offline after the first load. Three phases: (1) web app manifest + SVG icons making the app installable, (2) service worker with `injectManifest` strategy providing precise cache control, (3) two React UX components — an offline banner and an update toast — wired into the global Layout.

## Current State Analysis

- Astro `output: "server"` (SSR) with `@astrojs/cloudflare` adapter — Vite client assets land in `dist/client/`
- `vite-plugin-pwa` not installed; no service worker or manifest exists
- `public/` contains only `favicon.png` (733 bytes) — no PWA icons
- `src/layouts/Layout.astro:14`: `<html lang="en">` (should be `pl`), no `<meta name="theme-color">`
- `Banner.astro` — styling reference for offline banner colors (warning: `#fef3c7` bg, `#78350f` text, `#f59e0b` border)
- `src/components/ui/button.tsx` — `Button` component available for UpdatePwaToast's reload action

## Desired End State

- Chrome on Android shows the PWA install prompt; Safari on iOS allows "Add to Home Screen"
- App opens in `display: standalone` mode (no browser chrome) when launched from home screen
- After first load, visiting `/donations` while offline shows the last-cached HTML with an orange banner
- Visiting a never-cached URL offline shows a custom Polish offline page
- When a new version deploys, an "Nowa wersja dostępna" toast with "Odśwież" appears

### Key Discoveries:

- `src/layouts/Layout.astro:14` — `<html lang="en">` to fix; only place to add `<meta name="theme-color">`
- `src/components/Banner.astro` — styling reference for OfflineBanner (warning: `#fef3c7`/`#78350f`/`#f59e0b`)
- `src/components/ui/button.tsx:35` — `Button` component for UpdatePwaToast reload action
- `astro.config.mjs:13` — `vite.plugins` already has `[tailwindcss()]`; VitePWA goes here

## What We're NOT Doing

- No IndexedDB or background sync — donations are not queryable offline (only cached HTML is shown)
- No custom install prompt UI — browser native only
- No push notifications
- No offline mutation support — API calls fail gracefully when offline; no queuing

## Implementation Approach

Install `vite-plugin-pwa` and use `strategies: 'injectManifest'` with a custom `src/sw.ts`. This avoids the GenerateSW conflict where `navigateFallback` and a navigation `runtimeCaching` entry register competing routes. The SW explicitly chains: NetworkOnly for `/api/*`, CacheFirst for `/_astro/*` assets, NetworkFirst for navigation (caches after first visit; falls back to pre-cached `public/offline.html` when both network and cache fail). `UpdatePwaToast` handles SW registration via `useRegisterSW` (required since `injectRegister: null`).

## Critical Implementation Details

**`injectRegister: null` required for SSR**: `injectRegister: 'auto'` hooks into Vite's `transformIndexHtml` which does not fire for SSR page responses from Cloudflare Workers. Set `injectRegister: null` and register the SW inside `UpdatePwaToast` via `useRegisterSW()` (mounted `client:load` in Layout). Without this, the SW is never registered in production.

**InjectManifest over GenerateSW for navigation caching**: In Workbox's `generateSW`, a `runtimeCaching` navigation entry and `navigateFallback` register competing routes — the first registered (runtimeCaching) wins and the fallback never fires for offline-uncached pages. `strategies: 'injectManifest'` with a custom SW gives explicit, ordered route registration where NetworkFirst handles cached pages and a `try/catch` falls through to `caches.match('/offline.html')`.

**`workbox.globDirectory: 'dist/client'`**: With `output: "server"`, vite-plugin-pwa must be told that client assets are in `dist/client/`, not `dist/`. Without this, the precache manifest references non-existent paths.

---

## Phase 1: Manifest + Icons

### Overview

Install `vite-plugin-pwa`, create the SVG blood-drop icon and its PNG exports, configure the web app manifest, fix the HTML lang attribute, and add the theme-color meta tag. This phase makes the app installable.

### Changes Required:

#### 1. Install vite-plugin-pwa

**File**: `package.json`

**Intent**: Add `vite-plugin-pwa` as a dev dependency. It ships Workbox + manifest generation.

**Contract**: `"vite-plugin-pwa": "^0.21.0"` (or latest stable) under `devDependencies`. Run `npm install`.

#### 2. Create SVG icon

**File**: `public/icon.svg`

**Intent**: Blood-drop icon with a white "V" letterform on red (#dc2626). Source for all PNG exports and referenced directly in the manifest for SVG-capable browsers.

**Contract**: `viewBox="0 0 512 512"`. Blood drop shape: teardrop pointing upward, circle base (~270px diameter centered at x=256, y=310), pointed vertex at ~y=70. White "V" centered. For `purpose: "any maskable"`, keep the main shape within the central 80% safe zone (~40px padding on each side). Approximate structure (implementer should refine the path):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M256 70 C220 130 110 250 110 320 a146 146 0 0 0 292 0 C402 250 292 130 256 70Z" fill="#dc2626"/>
  <text x="256" y="390" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="220" fill="white">V</text>
</svg>
```

#### 3. Export PNG icons

**File**: `public/icon-192.png`, `public/icon-512.png`

**Intent**: Raster icons required by the PWA manifest and Android Chrome install prompt.

**Contract**: Two PNG files committed to `public/`. Generate with a one-time script `scripts/generate-icons.mjs` using `sharp` (install as a temporary devDep). The script is run once; the PNGs are committed. Example:

```js
import sharp from 'sharp'
for (const size of [192, 512]) {
  await sharp('public/icon.svg').resize(size).png().toFile(`public/icon-${size}.png`)
}
```

#### 4. Configure VitePWA in astro.config.mjs

**File**: `astro.config.mjs`

**Intent**: Add VitePWA to `vite.plugins` with manifest definition and `injectManifest` strategy. The Workbox config is expanded in Phase 2.

**Contract**: Import `VitePWA` from `'vite-plugin-pwa'`. Add alongside `tailwindcss()` in `vite.plugins`:

```js
VitePWA({
  registerType: 'prompt',
  injectRegister: null,
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  manifest: {
    name: 'Vena',
    short_name: 'Vena',
    description: 'Kalkulator dat kwalifikowalności do oddawania krwi',
    theme_color: '#dc2626',
    background_color: '#ffffff',
    display: 'standalone',
    lang: 'pl',
    start_url: '/',
    scope: '/',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  },
  workbox: {
    globDirectory: 'dist/client',
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}'],
  },
})
```

#### 5. Fix HTML lang and add theme-color in Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Correct the document language to Polish and add the PWA theme-color meta tag.

**Contract**: Change `<html lang="en">` → `<html lang="pl">` at line 14. Add `<meta name="theme-color" content="#dc2626" />` inside `<head>` after the viewport meta tag.

### Success Criteria:

#### Automated Verification:

- `npm run build` succeeds and `dist/client/manifest.webmanifest` exists
- `npm run lint` passes

#### Manual Verification:

- DevTools → Application → Manifest: name "Vena", icons listed, display "standalone", lang "pl"
- Lighthouse PWA audit → "Installable" section passes (or only SW-related items remain, resolved in Phase 2)

**Implementation Note**: After Phase 1 automated checks pass and the manifest is visible in DevTools, confirm before proceeding to Phase 2.

---

## Phase 2: Service Worker + Offline Page

### Overview

Create `src/sw.ts` with explicit Workbox routing (NetworkFirst for navigation with offline fallback, CacheFirst for assets, NetworkOnly for API). Create the static Polish offline page. After this phase, the app is usable offline for previously visited pages.

### Changes Required:

#### 1. Create src/sw.ts — service worker template

**File**: `src/sw.ts`

**Intent**: Custom service worker with explicit, ordered Workbox routes. `self.__WB_MANIFEST` is the injection point replaced by vite-plugin-pwa with the precache manifest at build time.

**Contract**:

```ts
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

// API: never cache, always network
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkOnly()
)

// Astro static assets: long-lived cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/_astro/'),
  new CacheFirst({
    cacheName: 'astro-static',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
)

// Navigation: NetworkFirst; fall back to /offline.html when both cache and network fail
const navStrategy = new NetworkFirst({ cacheName: 'pages' })
registerRoute(
  new NavigationRoute(async (params) => {
    try {
      return await navStrategy.handle(params)
    } catch {
      return (await caches.match('/offline.html')) ?? new Response('Offline', { status: 503 })
    }
  }, { denylist: [/^\/api/] })
)
```

#### 2. Create public/offline.html — static offline fallback

**File**: `public/offline.html`

**Intent**: Minimal self-contained Polish HTML page served when the user visits a never-cached URL offline. Must not depend on external JS, CSS, or fonts.

**Contract**: Inline-styled HTML. Heading "Brak połączenia", body text "Ta strona nie jest dostępna offline — sprawdź połączenie i spróbuj ponownie.", reload button `onclick="window.location.reload()"`. Colors: white background, `#dc2626` accents. No `<script src>` or `<link rel="stylesheet">` — fully self-contained.

#### 3. Add vite-plugin-pwa types to env.d.ts

**File**: `src/env.d.ts`

**Intent**: Make the virtual module `virtual:pwa-register/react` and the `__WB_MANIFEST` injection type-safe in TypeScript.

**Contract**: Add `/// <reference types="vite-plugin-pwa/client" />` at the top of `src/env.d.ts`.

### Success Criteria:

#### Automated Verification:

- `npm run build` — `dist/client/sw.js` exists
- `npm run lint` passes with no TypeScript errors in `src/sw.ts`

#### Manual Verification:

- DevTools → Application → Service Workers: "Activated and running" after first page load
- DevTools → Network → Offline; navigate to `/donations` (previously loaded): page serves from SW cache
- Offline + never-visited page URL: `public/offline.html` content appears
- DevTools → Application → Cache Storage: "pages" cache contains previously visited URLs

**Implementation Note**: Pause after manual SW cache verification before proceeding to Phase 3.

---

## Phase 3: Offline UX Components

### Overview

Add two React components to the global Layout: `OfflineBanner` (detects online/offline state) and `UpdatePwaToast` (registers SW and surfaces the update notification). Both mount with `client:load`.

### Changes Required:

#### 1. Create OfflineBanner component

**File**: `src/components/pwa/OfflineBanner.tsx`

**Intent**: Dismissible warning banner that appears when the device goes offline, telling the donor they are viewing cached data.

**Contract**: State: `isOnline` (bool, init from `navigator.onLine`) and `dismissed` (bool, init false). `useEffect` adds `online`/`offline` listeners on `window`; cleans up on unmount; resets `dismissed` to false when back online. When `!isOnline && !dismissed`: renders a `<div>` with inline styles matching `Banner.astro`'s `banner--warning` variant (`background: #fef3c7`, `color: #78350f`, `borderBottom: '1px solid #f59e0b'`, `padding: '0.75rem 1rem'`, `fontSize: '0.875rem'`, `textAlign: 'center'`). Text: "Przeglądasz zapisane dane — brak połączenia." Dismiss `×` button on the right sets `dismissed` to true. Returns `null` otherwise.

No external imports beyond React — deliberate to avoid dependencies in this fallback component.

#### 2. Create UpdatePwaToast component

**File**: `src/components/pwa/UpdatePwaToast.tsx`

**Intent**: Registers the SW (since `injectRegister: null`) and shows a fixed toast when a new SW version is waiting to activate.

**Contract**: Uses `useRegisterSW` from `'virtual:pwa-register/react'`. The `onNeedRefresh` callback sets `showToast` state to true. When `showToast`: render a fixed bottom-right `<div>` (position fixed, bottom 1rem, right 1rem, z-index 50, white background, box-shadow, border-radius, padding). Content: "Nowa wersja dostępna" text + `Button` labeled "Odśwież" that calls `updateServiceWorker(true)` + dismiss `×` that sets `showToast` to false. Uses `Button` from `'@/components/ui/button'`. Returns `null` when `!showToast`.

`useRegisterSW` implicitly registers the SW on mount — this is the correct SW registration path when `injectRegister: null`.

#### 3. Wire both components into Layout

**File**: `src/layouts/Layout.astro`

**Intent**: Mount both PWA components on every page.

**Contract**: In the Layout frontmatter, add:
```ts
import OfflineBanner from "@/components/pwa/OfflineBanner";
import UpdatePwaToast from "@/components/pwa/UpdatePwaToast";
```
In `<body>`, before the existing `{missingConfigs.map(...)}` block:
```astro
<OfflineBanner client:load />
<UpdatePwaToast client:load />
```

### Success Criteria:

#### Automated Verification:

- `npm run build` succeeds
- `npm run lint` passes — React Compiler rules satisfied (no invalid hook usage)

#### Manual Verification:

- DevTools → Network → Offline → banner "Przeglądasz zapisane dane — brak połączenia." appears
- Toggle back online → banner disappears
- Dismiss `×` hides banner for the session; returning online resets dismiss state
- DevTools → Application → Service Workers → "Skip waiting" on a staged SW → "Nowa wersja dostępna" toast appears; click "Odśwież" → page reloads with new SW active

---

## Testing Strategy

### Unit Tests:

- `OfflineBanner`: renders when `navigator.onLine` is false; disappears on `online` event; dismiss hides it; coming back online resets dismiss state
- `UpdatePwaToast`: renders null by default; shows toast when `onNeedRefresh` fires; "Odśwież" calls `updateServiceWorker(true)`

(No test runner configured yet per AGENTS.md — add when testing infrastructure from the test plan is in place.)

### Manual Testing Steps:

1. `npm run build`, deploy to Cloudflare preview (or use `npm run dev` with `devOptions: { enabled: true }` added to VitePWA config temporarily)
2. Open in Chrome on Android — confirm install prompt appears
3. Install, open from home screen — confirm standalone display (no URL bar)
4. Load `/donations`, go offline, reload → cached page + OfflineBanner shown
5. Go to a URL never visited while offline → `offline.html` content shown
6. DevTools "Skip waiting" on a new SW → UpdatePwaToast appears, "Odśwież" works

## Performance Considerations

The SW adds ~50–100ms to the first page load (registration + cache population). From the second visit, `/_astro/*` assets hit CacheFirst (instant); navigation hits NetworkFirst (network is tried but cache responds immediately on failure). No JS bundle size impact for the app itself.

## Migration Notes

No migration needed. Users who have never visited will download the SW on their first visit and be covered from that point forward.

## References

- PRD FR-011: `context/foundation/prd.md`
- Roadmap S-05 + risk note: `context/foundation/roadmap.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Manifest + Icons

#### Automated

- [x] 1.1 `npm run build` succeeds — `dist/client/manifest.webmanifest` exists
- [x] 1.2 `npm run lint` passes

#### Manual

- [x] 1.3 DevTools → Application → Manifest: name "Vena", icons listed, display "standalone", lang "pl"
- [x] 1.4 Lighthouse PWA → "Installable" check passes (or only SW items remain)

### Phase 2: Service Worker + Offline Page

#### Automated

- [ ] 2.1 `npm run build` — `dist/client/sw.js` exists
- [ ] 2.2 `npm run lint` passes — no TypeScript errors in `src/sw.ts`

#### Manual

- [ ] 2.3 DevTools → Application → Service Workers: "Activated and running"
- [ ] 2.4 Offline + previously-visited `/donations` → cached page loads
- [ ] 2.5 Offline + never-visited page → `offline.html` content shown
- [ ] 2.6 DevTools → Cache Storage → "pages" cache shows visited URLs

### Phase 3: Offline UX Components

#### Automated

- [ ] 3.1 `npm run build` succeeds
- [ ] 3.2 `npm run lint` passes — React Compiler rules satisfied

#### Manual

- [ ] 3.3 DevTools Offline toggle → "Przeglądasz zapisane dane — brak połączenia." banner appears
- [ ] 3.4 Back online → banner disappears; dismiss `×` hides for session and resets on online
- [ ] 3.5 DevTools "Skip waiting" → toast appears; "Odśwież" reloads with new SW active

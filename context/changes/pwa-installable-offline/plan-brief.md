# PWA Installable + Offline — Plan Brief

> Full plan: `context/changes/pwa-installable-offline/plan.md`

## What & Why

Add FR-011: make Vena installable as a PWA and usable offline after the first load. Phone-installable + offline-usable is an explicit MVP success criterion — it makes Vena feel like a real app rather than a mobile website, and lets donors check their eligibility dates on the go without connectivity.

## Starting Point

No service worker, manifest, or PWA infrastructure exists. `vite-plugin-pwa` is not installed. `public/` has only a 32×32 `favicon.png`. The app uses Astro SSR (`output: "server"`) with Cloudflare Workers, which constrains how the service worker is registered (auto-injection via Vite's HTML transform doesn't work for SSR responses).

## Desired End State

The app passes PWA installability checks. On Android Chrome, the install prompt appears; on iOS Safari, "Add to Home Screen" works. When a donor opens the app from their home screen, it opens standalone (no URL bar). After the first load, visiting `/donations` while offline shows the last-cached page with an "offline" banner. A never-cached page shows a custom Polish offline fallback. When a new version deploys, a toast prompts the user to reload.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Offline scope | App shell + last-seen pages cached | Covers the core use case: donor checks dates on the go without full data sync complexity | Plan |
| Cache strategy for pages | NetworkFirst (caches after first visit, fallback to /offline.html) | Balances freshness with offline access; avoids stale eligibility dates on API calls | Plan |
| Cache strategy for API routes | NetworkOnly | Eligibility data must be live; serving stale donation data is a correctness risk | Plan |
| SW integration | `strategies: 'injectManifest'` with `src/sw.ts` | GenerateSW's `navigateFallback` conflicts with navigation `runtimeCaching` — explicit routes eliminate ambiguity | Plan |
| SW registration | `injectRegister: null` + `useRegisterSW` in React component | `injectRegister: 'auto'` uses Vite's `transformIndexHtml` which doesn't fire for SSR responses | Plan |
| SW update UX | "Nowa wersja dostępna" toast with reload button | User controls when to update; no surprise mid-session reloads | Plan |
| Install prompt | Browser native | Zero implementation effort; correct per platform | Plan |
| Icons | SVG blood-drop with "V" letterform, exported as 192 + 512 PNGs | Visual identity consistent with the app's medical/blood theme | Plan |
| Offline fallback | Custom `public/offline.html` in Polish | Maintains app branding; browser default ("dinosaur") breaks the installed-app illusion | Plan |

## Scope

**In scope:**
- Web app manifest (name, icons, display, lang, theme-color)
- SVG icon design + 192×192 / 512×512 PNG exports
- Service worker (vite-plugin-pwa `injectManifest`) with three cache strategies
- Static `public/offline.html` fallback page
- `OfflineBanner` React component (online/offline detection)
- `UpdatePwaToast` React component (SW update notification + registration)

**Out of scope:**
- IndexedDB / offline data sync — donated data not queryable offline
- Custom install prompt banner
- Push notifications
- Offline mutation queuing (API calls fail gracefully)

## Architecture / Approach

vite-plugin-pwa added as a Vite plugin in `astro.config.mjs` alongside the existing `tailwindcss()` plugin. SW registration handled client-side by `UpdatePwaToast` (React, `client:load`) using `useRegisterSW` from `virtual:pwa-register/react` — this is required because `injectRegister: 'auto'` doesn't work with SSR. `src/sw.ts` is the custom SW template: Workbox routes in explicit priority order (NetworkOnly → CacheFirst → NavigationRoute with try/catch fallback to `caches.match('/offline.html')`). Static assets in `dist/client/` are precached via `self.__WB_MANIFEST`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Manifest + Icons | App passes installability checks; manifest in DevTools | SVG-to-PNG export quality at 192px (may look rough if path is too complex) |
| 2. Service Worker + Offline Page | App usable offline for visited pages; custom fallback for others | vite-plugin-pwa InjectManifest + Cloudflare adapter compatibility (verify `dist/client/sw.js` exists) |
| 3. Offline UX Components | Offline banner + update toast wired into Layout | React Compiler lint rules — ensure hooks in both components are compliant |

**Prerequisites:** None — S-05 has no roadmap dependencies; can run in parallel with F-01 and S-01.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- vite-plugin-pwa v0.21 + `@astrojs/cloudflare` v13: verify the generated `dist/client/sw.js` path after first build — if the adapter changes output structure in future versions, `globDirectory: 'dist/client'` may need adjustment.
- `sharp` for icon generation is a devDep added temporarily — can be removed after PNGs are committed.
- iOS Safari has no `beforeinstallprompt` event; the install path is Share → Add to Home Screen. Users who don't know this pattern won't discover it. Acceptable for MVP.

## Success Criteria (Summary)

- Chrome on Android shows PWA install prompt; app opens standalone from home screen
- After first load, `/donations` page serves from SW cache while offline (with offline banner)
- DevTools → Application → Manifest and Service Workers both show active configuration

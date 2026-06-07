import { describe, expect, it } from "vitest";
import { buildContext, invokeMiddleware, invokeRoute } from "@/test/middleware-harness";
import { POST as profilePost } from "@/pages/api/profile";
import { POST as donationsPost } from "@/pages/api/donations";
import { POST as donationByIdPost } from "@/pages/api/donations/[id]";
import { POST as donationDeletePost } from "@/pages/api/donations/[id]/delete";
import { GET as donationsExportGet } from "@/pages/api/donations/export";

// Dynamic-segment placeholders — the inline/middleware checks run before any
// by-id lookup, so the value is immaterial to what's being proven here; it
// only needs to be syntactically valid.
const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";

// Page tier: gated centrally by `PROTECTED_ROUTES` in src/middleware.ts — the
// literal "manually maintained list" risk #5 is about. `/donations/[id]/edit`
// is covered only by the `startsWith("/donations")` prefix match, never an
// explicit list entry (a documented near-miss, research.md:103/166).
const pageTierCases = [
  { pathname: "/profile", params: {} },
  { pathname: "/donations", params: {} },
  { pathname: `/donations/${PLACEHOLDER_ID}/edit`, params: { id: PLACEHOLDER_ID } },
];

describe("route protection — page tier (middleware-governed)", () => {
  it.each(pageTierCases)(
    "middleware redirects an unauthenticated visitor to /auth/signin: $pathname",
    async ({ pathname, params }) => {
      const context = buildContext({ pathname, params, locals: { user: null } });
      const { response, calledNext } = await invokeMiddleware(context);

      expect(calledNext).toBe(false);
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/auth/signin");
    },
  );
});

// API tier: `/api/*` paths never match `PROTECTED_ROUTES` (none start with
// `/profile` or `/donations`) — each does its own inline `locals.user` check.
// This is documented, deliberate precedent (research.md:109/173), not an
// inconsistency. The oracle here is "does the handler check `locals.user`
// itself," not middleware-list membership — a different assertion shape than
// the page tier above.
const apiTierCases = [
  { label: "POST /api/profile", method: "POST", pathname: "/api/profile", params: {}, handler: profilePost },
  { label: "POST /api/donations", method: "POST", pathname: "/api/donations", params: {}, handler: donationsPost },
  {
    label: "POST /api/donations/[id]",
    method: "POST",
    pathname: `/api/donations/${PLACEHOLDER_ID}`,
    params: { id: PLACEHOLDER_ID },
    handler: donationByIdPost,
  },
  {
    label: "POST /api/donations/[id]/delete",
    method: "POST",
    pathname: `/api/donations/${PLACEHOLDER_ID}/delete`,
    params: { id: PLACEHOLDER_ID },
    handler: donationDeletePost,
  },
  {
    label: "GET /api/donations/export",
    method: "GET",
    pathname: "/api/donations/export",
    params: {},
    handler: donationsExportGet,
  },
];

describe("route protection — API tier (self-guarding)", () => {
  it.each(apiTierCases)(
    "handler redirects an unauthenticated visitor to /auth/signin: $label",
    async ({ method, pathname, params, handler }) => {
      const context = buildContext({ method, pathname, params, locals: { user: null } });
      const response = await invokeRoute(handler, context);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/auth/signin");
    },
  );
});

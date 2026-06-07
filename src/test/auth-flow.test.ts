import { describe, expect, it } from "vitest";
import { buildContext, chainCookies, invokeMiddleware, invokeRoute } from "@/test/middleware-harness";
import { createSeededAccount } from "@/test/auth-fixtures";
import { POST as signinPost } from "@/pages/api/auth/signin";

describe("auth-flow handshake (risk #2)", () => {
  it("valid credentials: signin sets a session cookie, and the next request reaches /donations as the seeded user", async () => {
    const account = await createSeededAccount();

    const signinContext = buildContext({
      method: "POST",
      pathname: "/api/auth/signin",
      formData: { email: account.email, password: account.password },
    });
    const signinResponse = await invokeRoute(signinPost, signinContext);

    expect(signinResponse.status).toBe(302);
    expect(signinResponse.headers.get("Location")).toBe("/donations");
    const setCookieHeaders = [...signinContext.cookies.headers()];
    expect(setCookieHeaders.length).toBeGreaterThan(0);

    const cookieHeader = chainCookies(signinContext);
    const donationsContext = buildContext({
      pathname: "/donations",
      cookieHeader,
      locals: { user: null },
    });
    const { response, calledNext, capturedUser } = await invokeMiddleware(donationsContext);

    expect(calledNext).toBe(true);
    expect(response.status).toBe(200);
    expect(capturedUser).not.toBeNull();
    expect(capturedUser?.id).toBe(account.userId);
  });

  it("wrong password: signin is rejected, sets no session cookie, and the next request is still redirected to /auth/signin", async () => {
    const account = await createSeededAccount();

    const signinContext = buildContext({
      method: "POST",
      pathname: "/api/auth/signin",
      formData: { email: account.email, password: "definitely-the-wrong-password" },
    });
    const signinResponse = await invokeRoute(signinPost, signinContext);

    expect(signinResponse.status).toBe(302);
    expect(signinResponse.headers.get("Location")).toMatch(/^\/auth\/signin\?error=/);
    const setCookieHeaders = [...signinContext.cookies.headers()];
    expect(setCookieHeaders).toHaveLength(0);

    const cookieHeader = chainCookies(signinContext);
    const donationsContext = buildContext({
      pathname: "/donations",
      cookieHeader,
      locals: { user: null },
    });
    const { response, calledNext } = await invokeMiddleware(donationsContext);

    // The middleware sets `locals.user` synchronously before the protection
    // check — and short-circuits with a redirect without ever calling `next`,
    // so there is no `next`-time capture here. Reading the context directly is
    // the real, observable proof that a rejected login never reaches a
    // protected page with a populated user.
    expect(calledNext).toBe(false);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(donationsContext.locals.user).toBeNull();
  });
});

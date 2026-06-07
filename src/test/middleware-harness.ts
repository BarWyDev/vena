import { createContext } from "astro/middleware";
import type { APIContext, APIRoute, MiddlewareNext, Params } from "astro";
import { onRequest } from "@/middleware";

/** Matches `supabase/config.toml`'s `auth.site_url` — the base every constructed Request resolves against. */
const SITE_URL = "http://127.0.0.1:3000";

interface BuildContextOptions {
  method?: string;
  pathname: string;
  params?: Params;
  formData?: Record<string, string>;
  cookieHeader?: string;
  locals?: App.Locals;
}

/**
 * Builds a real `APIContext` via Astro's own `createContext` — `url` is derived
 * from the constructed `Request` (not hand-passed), `cookies` is a real
 * `AstroCookies`, and `redirect()` returns a real `Response`.
 */
export function buildContext({
  method = "GET",
  pathname,
  params = {},
  formData,
  cookieHeader,
  locals = { user: null },
}: BuildContextOptions): APIContext {
  const headers = new Headers();
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  let body: string | undefined;
  if (formData) {
    const encoded = new URLSearchParams();
    for (const [key, value] of Object.entries(formData)) {
      encoded.append(key, value);
    }
    body = encoded.toString();
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  }

  const request = new Request(new URL(pathname, SITE_URL), { method, headers, body });
  return createContext({ request, params, locals });
}

/** Invokes a route's exported HTTP handler exactly as the adapter would, returning the real `Response`. */
export async function invokeRoute(handler: APIRoute, context: APIContext): Promise<Response> {
  return handler(context);
}

export interface MiddlewareInvocation {
  response: Response;
  /** `context.locals.user` captured at the moment `next` was called — the proof of "logged in," not page output. */
  capturedUser: App.Locals["user"] | undefined;
  calledNext: boolean;
}

/**
 * Invokes the project's real `onRequest` with a `next` stub that returns a sentinel
 * `Response` without rendering any Astro page — rendering would reintroduce the
 * "the page renders, so it works" anti-pattern this suite exists to challenge.
 */
export async function invokeMiddleware(context: APIContext): Promise<MiddlewareInvocation> {
  let capturedUser: App.Locals["user"] | undefined;
  let calledNext = false;

  const next: MiddlewareNext = () => {
    calledNext = true;
    capturedUser = context.locals.user;
    return Promise.resolve(new Response(null, { status: 200 }));
  };

  const response = await onRequest(context, next);
  return { response, capturedUser, calledNext };
}

/**
 * Reads the `Set-Cookie` strings a prior invocation queued on its context's
 * `AstroCookies`, and folds their `name=value` pairs into a single `Cookie`
 * header string for the next context's constructed `Request`.
 */
export function chainCookies(context: APIContext): string {
  const pairs: string[] = [];
  for (const setCookieHeader of context.cookies.headers()) {
    const [pair] = setCookieHeader.split(";");
    if (pair) {
      pairs.push(pair.trim());
    }
  }
  return pairs.join("; ");
}

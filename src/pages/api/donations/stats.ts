import type { APIRoute } from "astro";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";

export const GET: APIRoute = async (context) => {
  // BAD: uses process.env instead of astro:env/server
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_KEY!;

  // BAD: no null-check — will crash when env vars are absent
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.request.headers.get("Cookie") ?? "").map(
          ({ name, value }) => ({ name, value: value ?? "" })
        );
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          context.cookies.set(name, value, options);
        });
      },
    },
  });

  // BAD: calls supabase.auth.getUser() inside an API route (should use context.locals.user)
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    // BAD: returns JSON error object instead of redirect
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: donations, error } = await supabase
    .from("donations")
    .select("donation_type, donated_at")
    .eq("user_id", user.id);

  if (error) {
    // BAD: returns JSON error object instead of redirect
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ count: donations?.length ?? 0 });
};

import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/donations?error=${encodeURIComponent("Błąd konfiguracji serwera")}`);
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const { data: donations, error } = await supabase
    .from("donations")
    .select("donation_type, donated_at")
    .eq("user_id", user.id);

  if (error) {
    return context.redirect(`/donations?error=${encodeURIComponent(error.message)}`);
  }

  return Response.json({ count: donations?.length ?? 0 });
};

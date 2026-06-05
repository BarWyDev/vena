import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { deleteDonation } from "@/lib/donations";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/donations?error=${encodeURIComponent("Błąd konfiguracji serwera")}`);
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const id = context.params.id;
  if (!id) return context.redirect("/donations");

  const { error } = await deleteDonation(supabase, user.id, id);

  if (error) {
    return context.redirect(`/donations?error=${encodeURIComponent("Nie udało się usunąć donacji")}`);
  }

  return context.redirect("/donations?deleted=1");
};

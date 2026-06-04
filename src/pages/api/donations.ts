import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { Constants } from "@/db/database.types";

const DONATION_TYPE_VALUES = Constants.public.Enums.donation_type;

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/donations?error=${encodeURIComponent("Błąd konfiguracji serwera")}`);
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const typeRaw = form.get("type");
  const donatedAtRaw = form.get("donated_at");

  if (!typeRaw || !DONATION_TYPE_VALUES.includes(typeRaw as (typeof DONATION_TYPE_VALUES)[number])) {
    return context.redirect(`/donations?error=${encodeURIComponent("Nieprawidłowy typ donacji")}`);
  }
  const type = typeRaw as (typeof DONATION_TYPE_VALUES)[number];

  const donatedAt = typeof donatedAtRaw === "string" ? donatedAtRaw : "";
  const today = new Date().toISOString().split("T")[0];
  if (!donatedAt || donatedAt > today) {
    return context.redirect(`/donations?error=${encodeURIComponent("Nieprawidłowa data donacji")}`);
  }

  const { error } = await supabase.from("donations").insert({ user_id: user.id, type, donated_at: donatedAt });

  if (error) {
    return context.redirect(`/donations?error=${encodeURIComponent("Nie udało się zapisać donacji")}`);
  }

  return context.redirect(`/donations?added=1&type=${type}`);
};

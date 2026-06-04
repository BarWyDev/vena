import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { Constants } from "@/db/database.types";

const SEX_VALUES = Constants.public.Enums.sex;
const BLOOD_GROUP_VALUES = Constants.public.Enums.blood_group;
const RH_VALUES = Constants.public.Enums.rh;

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/profile?error=${encodeURIComponent("Błąd konfiguracji serwera")}`);
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const sexRaw = form.get("sex");
  const bloodGroupRaw = form.get("blood_group");
  const rhRaw = form.get("rh");

  if (!sexRaw || !SEX_VALUES.includes(sexRaw as (typeof SEX_VALUES)[number])) {
    return context.redirect(`/profile?error=${encodeURIComponent("Płeć jest wymagana")}`);
  }
  const sex = sexRaw as (typeof SEX_VALUES)[number];

  const blood_group =
    bloodGroupRaw && BLOOD_GROUP_VALUES.includes(bloodGroupRaw as (typeof BLOOD_GROUP_VALUES)[number])
      ? (bloodGroupRaw as (typeof BLOOD_GROUP_VALUES)[number])
      : null;

  const rh =
    rhRaw && RH_VALUES.includes(rhRaw as (typeof RH_VALUES)[number]) ? (rhRaw as (typeof RH_VALUES)[number]) : null;

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, sex, blood_group, rh }, { onConflict: "user_id" });

  if (error) {
    return context.redirect(`/profile?error=${encodeURIComponent("Nie udało się zapisać profilu")}`);
  }

  return context.redirect("/profile?saved=1");
};

import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { Constants } from "@/db/database.types";
import { getProfile } from "@/lib/profile";
import { getDonations, getLatestPerType } from "@/lib/donations";
import { calculateEligibility } from "@/lib/eligibility";
import type { DonationType } from "@/lib/eligibility";
import { generateIcs } from "@/lib/ics";

const DONATION_TYPE_VALUES = Constants.public.Enums.donation_type;

export const GET: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/donations?error=${encodeURIComponent("Błąd konfiguracji serwera")}`);
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const typeRaw = context.url.searchParams.get("type");
  const type: DonationType = DONATION_TYPE_VALUES.includes(typeRaw as (typeof DONATION_TYPE_VALUES)[number])
    ? (typeRaw as DonationType)
    : "whole_blood";

  const [profile, donations] = await Promise.all([getProfile(supabase, user.id), getDonations(supabase, user.id)]);

  if (!profile?.sex) {
    return context.redirect(`/donations?error=${encodeURIComponent("Uzupełnij profil przed eksportem")}`);
  }

  const eligibility = calculateEligibility(getLatestPerType(donations), profile.sex);
  const eligibilityDate = eligibility[type];

  if (!eligibilityDate) {
    return context.redirect(`/donations?error=${encodeURIComponent("Brak danych dla tego typu donacji")}`);
  }

  return new Response(generateIcs(type, eligibilityDate), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vena-donacja.ics"',
    },
  });
};

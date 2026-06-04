import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { Constants } from "@/db/database.types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function getProfile(supabase: SupabaseClient<Database>, userId: string): Promise<ProfileRow | null> {
  const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  return data ?? null;
}

export function isProfileComplete(profile: ProfileRow | null): boolean {
  return profile?.sex != null;
}

export const SEX_LABELS: Record<(typeof Constants.public.Enums.sex)[number], string> = {
  male: "Mężczyzna",
  female: "Kobieta",
};

export const BLOOD_GROUP_LABELS: Record<(typeof Constants.public.Enums.blood_group)[number], string> = {
  A: "A",
  B: "B",
  AB: "AB",
  O: "O",
};

export const RH_LABELS: Record<(typeof Constants.public.Enums.rh)[number], string> = {
  positive: "Rh+",
  negative: "Rh−",
};

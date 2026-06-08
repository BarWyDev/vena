import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { DonationType } from "@/lib/eligibility";
import { DONATION_TYPES } from "@/lib/eligibility";

export type DonationRow = Database["public"]["Tables"]["donations"]["Row"];

export async function getDonations(supabase: SupabaseClient<Database>, userId: string): Promise<DonationRow[]> {
  const { data } = await supabase
    .from("donations")
    .select("*")
    .eq("user_id", userId)
    .order("donated_at", { ascending: false });
  return data ?? [];
}

export function getLatestPerType(donations: DonationRow[]): Partial<Record<DonationType, string>> {
  const result: Partial<Record<DonationType, string>> = {};
  for (const donation of donations) {
    result[donation.type] ??= donation.donated_at;
  }
  return result;
}

export function getLatestIds(donations: DonationRow[]): string[] {
  const seen = new Set<DonationType>();
  const ids: string[] = [];
  for (const row of donations) {
    if (!seen.has(row.type)) {
      seen.add(row.type);
      ids.push(row.id);
    }
  }
  return ids;
}

export async function updateDonation(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  type: DonationType,
  donatedAt: string,
  volumeMl: number,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("donations")
    .update({ type, donated_at: donatedAt, volume_ml: volumeMl })
    .eq("id", id)
    .eq("user_id", userId);
  return { error };
}

export async function deleteDonation(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("donations").delete().eq("id", id).eq("user_id", userId);
  return { error };
}

export const DONATION_TYPE_LABELS: Record<DonationType, string> = {
  whole_blood: "Krew pełna",
  plasma: "Osocze",
  platelets: "Płytki krwi",
};

// Per-type standard volume (ml). Used both as the form's editable default and as
// the migration backfill value for pre-feature rows — keep the two in sync.
export const DEFAULT_VOLUME_ML: Record<DonationType, number> = {
  whole_blood: 450,
  plasma: 600,
  platelets: 220,
};

export function sumVolume(donations: DonationRow[]): number {
  return donations.reduce((total, donation) => total + donation.volume_ml, 0);
}

export function sumVolumeByType(donations: DonationRow[]): Record<DonationType, number> {
  const result: Record<DonationType, number> = { whole_blood: 0, plasma: 0, platelets: 0 };
  for (const donation of donations) {
    result[donation.type] += donation.volume_ml;
  }
  return result;
}

// Render millilitres as a Polish-formatted litre string: comma decimal, up to two
// decimals, trailing zeros trimmed (5400 → "5,4 l", 1000 → "1 l", 450 → "0,45 l").
// Computed manually rather than via Intl to stay deterministic across runtimes.
export function formatLiters(ml: number): string {
  const liters = Math.round((ml / 1000) * 100) / 100;
  const trimmed = liters.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${trimmed.replace(".", ",")} l`;
}

export { DONATION_TYPES };

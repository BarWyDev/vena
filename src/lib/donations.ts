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
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("donations")
    .update({ type, donated_at: donatedAt })
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

export { DONATION_TYPES };

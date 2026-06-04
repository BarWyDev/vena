import type { SupabaseClient } from "@supabase/supabase-js";
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

export const DONATION_TYPE_LABELS: Record<DonationType, string> = {
  whole_blood: "Krew pełna",
  plasma: "Osocze",
  platelets: "Płytki krwi",
};

export { DONATION_TYPES };

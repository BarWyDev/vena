import type { Database } from "@/db/database.types";

export type DonationType = Database["public"]["Enums"]["donation_type"];
export type Sex = Database["public"]["Enums"]["sex"];
export type EligibilityResult = Record<DonationType, string | null>;

export const DONATION_TYPES: DonationType[] = ["whole_blood", "plasma", "platelets"];

const INTERVALS_DAYS: Record<DonationType, Record<Sex, number>> = {
  whole_blood: { male: 56, female: 84 },
  plasma: { male: 14, female: 14 },
  platelets: { male: 28, female: 28 },
};

export function calculateEligibility(
  latestDonations: Partial<Record<DonationType, string>>,
  sex: Sex,
): EligibilityResult {
  const result = {} as EligibilityResult;
  for (const type of DONATION_TYPES) {
    const dateStr = latestDonations[type];
    if (!dateStr) {
      result[type] = null;
    } else {
      const date = new Date(dateStr + "T00:00:00Z");
      date.setUTCDate(date.getUTCDate() + INTERVALS_DAYS[type][sex]);
      result[type] = date.toISOString().split("T")[0];
    }
  }
  return result;
}

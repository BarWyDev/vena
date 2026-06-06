import type { DonationType } from "@/lib/eligibility";

export const DONATION_TYPE_SUMMARIES: Record<DonationType, string> = {
  whole_blood: "Krew pełna — najwcześniejszy termin oddania",
  plasma: "Osocze — najwcześniejszy termin oddania",
  platelets: "Płytki krwi — najwcześniejszy termin oddania",
};

export function generateIcs(type: DonationType, dateStr: string): string {
  const dateCompact = dateStr.replace(/-/g, "");
  const now = new Date();
  const dtstamp =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    String(now.getUTCDate()).padStart(2, "0") +
    "T" +
    String(now.getUTCHours()).padStart(2, "0") +
    String(now.getUTCMinutes()).padStart(2, "0") +
    String(now.getUTCSeconds()).padStart(2, "0") +
    "Z";
  const uid = `${type}-${dateStr}@vena`;
  const summary = DONATION_TYPE_SUMMARIES[type];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vena//Blood Donation Tracker//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dateCompact}`,
    `SUMMARY:${summary}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n") + "\r\n";
}

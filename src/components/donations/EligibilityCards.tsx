import { useState } from "react";
import type { EligibilityResult, DonationType } from "@/lib/eligibility";
import { DONATION_TYPES } from "@/lib/eligibility";
import { DONATION_TYPE_LABELS } from "@/lib/donations";

interface Props {
  eligibility: EligibilityResult;
  initialSelectedType: DonationType | null;
}

export default function EligibilityCards({ eligibility, initialSelectedType }: Props) {
  const [selectedType, setSelectedType] = useState<DonationType | null>(initialSelectedType);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {DONATION_TYPES.map((type) => {
        const date = eligibility[type];
        const isSelected = selectedType === type;

        return (
          <button
            key={type}
            type="button"
            onClick={() => {
              setSelectedType(type);
              window.history.replaceState(null, "", "/donations?type=" + type);
            }}
            className={`rounded-xl border p-4 text-left backdrop-blur-xl transition-colors ${
              isSelected
                ? "border-purple-400/50 bg-purple-500/20 ring-1 ring-purple-400/60"
                : "border-white/10 bg-white/10 hover:bg-white/15"
            }`}
          >
            <p className="text-xs font-medium text-blue-100/70">{DONATION_TYPE_LABELS[type]}</p>
            <p className="mt-1 text-sm font-semibold text-white">
              {date ? new Date(date + "T00:00:00Z").toLocaleDateString("pl-PL", { timeZone: "UTC" }) : "Brak danych"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

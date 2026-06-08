import { describe, expect, it } from "vitest";
import { sumVolume, sumVolumeByType, formatLiters } from "@/lib/donations";
import type { DonationRow } from "@/lib/donations";
import type { DonationType } from "@/lib/eligibility";

function row(type: DonationType, volumeMl: number): DonationRow {
  return {
    id: `${type}-${volumeMl}`,
    user_id: "u1",
    type,
    donated_at: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    volume_ml: volumeMl,
  };
}

describe("sumVolume", () => {
  it("empty list → 0", () => {
    expect(sumVolume([])).toBe(0);
  });

  it("mixed rows → total ml", () => {
    expect(sumVolume([row("whole_blood", 450), row("plasma", 600), row("whole_blood", 450)])).toBe(1500);
  });
});

describe("sumVolumeByType", () => {
  it("empty list → all types zero", () => {
    expect(sumVolumeByType([])).toEqual({ whole_blood: 0, plasma: 0, platelets: 0 });
  });

  it("absent types stay zero, present types accumulate", () => {
    const result = sumVolumeByType([row("whole_blood", 450), row("whole_blood", 450), row("plasma", 600)]);
    expect(result).toEqual({ whole_blood: 900, plasma: 600, platelets: 0 });
  });
});

describe("formatLiters", () => {
  it("sub-litre keeps two decimals", () => {
    expect(formatLiters(450)).toBe("0,45 l");
  });

  it("one decimal trims the trailing zero", () => {
    expect(formatLiters(5400)).toBe("5,4 l");
    expect(formatLiters(600)).toBe("0,6 l");
  });

  it("whole litres drop the decimal part", () => {
    expect(formatLiters(1000)).toBe("1 l");
    expect(formatLiters(0)).toBe("0 l");
  });

  it("rounds to two decimals", () => {
    expect(formatLiters(1235)).toBe("1,24 l");
  });
});

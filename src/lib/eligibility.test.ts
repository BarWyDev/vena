import { describe, expect, it } from "vitest";
import { calculateEligibility } from "@/lib/eligibility";

const DATE = "2026-01-01";

describe("calculateEligibility", () => {
  it("whole_blood male → 56 days later", () => {
    expect(calculateEligibility({ whole_blood: DATE }, "male").whole_blood).toBe("2026-02-26");
  });

  it("whole_blood female → 84 days later", () => {
    expect(calculateEligibility({ whole_blood: DATE }, "female").whole_blood).toBe("2026-03-26");
  });

  it("plasma male → 14 days later", () => {
    expect(calculateEligibility({ plasma: DATE }, "male").plasma).toBe("2026-01-15");
  });

  it("plasma female → 14 days later", () => {
    expect(calculateEligibility({ plasma: DATE }, "female").plasma).toBe("2026-01-15");
  });

  it("platelets male → 28 days later", () => {
    expect(calculateEligibility({ platelets: DATE }, "male").platelets).toBe("2026-01-29");
  });

  it("platelets female → 28 days later", () => {
    expect(calculateEligibility({ platelets: DATE }, "female").platelets).toBe("2026-01-29");
  });

  it("empty latestDonations → all null", () => {
    const result = calculateEligibility({}, "male");
    expect(result.whole_blood).toBeNull();
    expect(result.plasma).toBeNull();
    expect(result.platelets).toBeNull();
  });

  it("partial latestDonations → absent types are null", () => {
    const result = calculateEligibility({ whole_blood: DATE }, "male");
    expect(result.plasma).toBeNull();
    expect(result.platelets).toBeNull();
  });
});

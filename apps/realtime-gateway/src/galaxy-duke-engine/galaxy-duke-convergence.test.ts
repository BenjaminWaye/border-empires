import { describe, expect, it } from "vitest";

import { FIRST_ERA, buildHallEntry, courtCapturedThisEra, nextEra } from "./galaxy-duke-convergence.js";

const ranked = [
  { authUid: "a", label: "Aurelia", weight: 31.4 },
  { authUid: "b", label: "Vex", weight: 20 },
  { authUid: "c", label: "Kel", weight: 12 },
  { authUid: "d", label: "Ord", weight: 9 },
  { authUid: "e", label: "Pax", weight: 8 },
  { authUid: "f", label: "Zed", weight: 7 }
];

describe("convergence", () => {
  it("the highest Domain Weight takes the throne and the top five are recorded", () => {
    const entry = buildHallEntry(FIRST_ERA(0), ranked, 500)!;
    expect(entry).toMatchObject({ era: 1, endedAt: 500, emperorAuthUid: "a", emperorLabel: "Aurelia", domainWeight: 31.4 });
    expect(entry.standings.map((s) => s.authUid)).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("nobody holds a Planet: no entry", () => {
    expect(buildHallEntry(FIRST_ERA(0), [], 1)).toBeUndefined();
  });
  it("a new era counts captures from a fresh baseline", () => {
    const next = nextEra(FIRST_ERA(0), 12, 900);
    expect(next).toEqual({ era: 2, startedAt: 900, baselineCaptured: 12 });
    expect(courtCapturedThisEra(next, 12)).toBe(0);
    expect(courtCapturedThisEra(next, 15)).toBe(3);
    expect(courtCapturedThisEra(next, 10)).toBe(0);
  });
});

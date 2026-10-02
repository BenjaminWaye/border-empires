import { describe, expect, it } from "vitest";

import { campaignLabel, sectorNumberLabel } from "./galaxy-sector-label.js";

describe("sectorNumberLabel", () => {
  it("zero-pads to 3 digits", () => {
    expect(sectorNumberLabel(1)).toBe("Sector 001");
    expect(sectorNumberLabel(42)).toBe("Sector 042");
    expect(sectorNumberLabel(123)).toBe("Sector 123");
  });

  it("does not truncate a 4+ digit sector number", () => {
    expect(sectorNumberLabel(1234)).toBe("Sector 1234");
  });
});

describe("campaignLabel", () => {
  it("labels a Frontier win", () => {
    expect(campaignLabel(1, { kind: "FRONTIER" })).toBe("Frontier Expansion of Sector 001");
  });

  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [23, "23rd"],
    [101, "101st"],
    [111, "111th"]
  ])("labels contestation ordinal %i as %s", (ordinal, suffix) => {
    expect(campaignLabel(7, { kind: "CONTESTATION", ordinal })).toBe(`${suffix} Contestation of Sector 007`);
  });
});

import { describe, expect, it } from "vitest";

import { dealFactsText } from "./client-hud-v2-diplomacy.js";

// Playtest 2026-11-12 (pt-predator, pt-diplomat): the deal header read
// "20 tiles · you 1" and nobody could tell what the 1 was.
describe("dealFactsText", () => {
  it("says the second count is your own tiles", () => {
    expect(dealFactsText("Truce", 20, 1)).toBe("Truce · 20 tiles · you have 1");
  });

  it("drops what it doesn't know and singularises one tile", () => {
    expect(dealFactsText("", 1, undefined)).toBe("1 tile");
    expect(dealFactsText("", undefined, undefined)).toBe("");
  });
});

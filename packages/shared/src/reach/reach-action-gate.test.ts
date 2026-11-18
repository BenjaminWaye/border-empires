import { describe, expect, it } from "vitest";
import { frontierBuildBlockedByReach, garrisonBlockedByReach } from "./reach-action-gate.js";

describe("reach action gate (mirrors the simulation's OUT_OF_REACH rules)", () => {
  it("blocks Garrison on plain land outside your reach, but not exempt tiles", () => {
    expect(garrisonBlockedByReach({}, false)).toBe(true);
    expect(garrisonBlockedByReach({}, true)).toBe(false);
    expect(garrisonBlockedByReach({ town: {} }, false)).toBe(false);
    expect(garrisonBlockedByReach({ dockId: "d1" }, false)).toBe(false);
    expect(garrisonBlockedByReach({ economicStructure: {} }, false)).toBe(false);
  });

  it("blocks a garrison-first build outside your reach, even inside a rival's reach", () => {
    expect(frontierBuildBlockedByReach({}, "HYDROGARDEN", { inOwnReach: false, inAnyReach: true })).toBe(true);
    expect(frontierBuildBlockedByReach({}, "RELAY_BEACON", { inOwnReach: false, inAnyReach: false })).toBe(true);
    expect(frontierBuildBlockedByReach({}, "HYDROGARDEN", { inOwnReach: true, inAnyReach: true })).toBe(false);
  });

  it("lets the siege ladder build inside anyone's reach, never in no-man's-land", () => {
    expect(frontierBuildBlockedByReach({}, "SIEGE_BATTERY", { inOwnReach: false, inAnyReach: true })).toBe(false);
    expect(frontierBuildBlockedByReach({}, "SIEGE_BATTERY", { inOwnReach: false, inAnyReach: false })).toBe(true);
  });
});

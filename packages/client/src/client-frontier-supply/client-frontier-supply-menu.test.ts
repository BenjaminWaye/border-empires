import { describe, expect, it } from "vitest";

import { supplyChokepointHeaderStatus, withSupplyChokepointStatus } from "./client-frontier-supply-menu.js";

const choke = { x: 3, y: 4, dependentTiles: 14, pinch: true };

describe("supply chokepoint tile-menu status", () => {
  it("says how many tiles depend on the chokepoint and what happens if it falls", () => {
    const status = supplyChokepointHeaderStatus(choke);
    expect(status.text).toBe("Supply chokepoint — 14 tiles depend on it");
    expect(status.tone).toBe("warning");
    expect(status.helpText).toMatch(/those 14 tiles are cut off and lost at once/);
    expect(supplyChokepointHeaderStatus({ ...choke, dependentTiles: 1 }).text).toBe("Supply chokepoint — 1 tile depends on it");
  });

  it("replaces the plain beyond-reach line and fills an empty header", () => {
    expect(withSupplyChokepointStatus({ text: "Beyond your reach", tone: "warning" }, choke)?.text).toMatch(/^Supply chokepoint/);
    expect(withSupplyChokepointStatus(undefined, choke)?.text).toMatch(/^Supply chokepoint/);
  });

  it("leaves every other status alone, and does nothing without a chokepoint", () => {
    const cutOff = { text: "Cut off from supply — disappears in 3s", tone: "warning" as const };
    expect(withSupplyChokepointStatus(cutOff, choke)).toBe(cutOff);
    expect(withSupplyChokepointStatus(undefined, undefined)).toBeUndefined();
  });
});

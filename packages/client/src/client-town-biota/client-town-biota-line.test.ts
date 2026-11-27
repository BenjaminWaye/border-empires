import { describe, expect, it } from "vitest";
import { terrainAdjustedTownManpower } from "@border-empires/shared";
import { townBiotaLineHtml } from "./client-town-biota-line.js";

describe("townBiotaLineHtml", () => {
  it("reports a partly supplied Metropolis's share and the manpower it loses", () => {
    const line = townBiotaLineHtml("4,4", "METROPOLIS", [{ tileKey: "4,4", received: 3, needed: 6, manpowerTier: "GREAT_CITY" }], {})!;
    const gap = terrainAdjustedTownManpower("METROPOLIS", undefined).cap - terrainAdjustedTownManpower("TOWN", undefined).cap;
    expect(line).toContain("50% of need met");
    expect(line).toContain(`−${Math.round(gap / 2).toLocaleString()} manpower cap`);
    expect(line).toContain("less Coin");
  });
  it("says a fully supplied town gives full manpower and Coin", () => {
    expect(townBiotaLineHtml("4,4", "CITY", [{ tileKey: "4,4", received: 1, needed: 1, manpowerTier: "CITY" }], {})).toContain("full manpower and Coin");
  });
});

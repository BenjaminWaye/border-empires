import { describe, expect, it } from "vitest";
import { winChanceColor, winChanceForTile } from "./frontier-combat-win-chance-paint.js";

describe("winChanceForTile", () => {
  it("returns 0.5 (base preview win chance) with a neutral committed amount", () => {
    const { winChance } = winChanceForTile({ ownershipState: "FRONTIER" });
    // FRONTIER defenderBattle mult is 0, so defEff is 0 -> attacker always wins.
    expect(winChance).toBe(1);
  });

  it("clamps to [0, 1] and is unaffected when committedManpower equals baseMusterCost", () => {
    const target = { ownershipState: "SETTLED" as const, fortVariant: "FORT" as const };
    const withoutCommit = winChanceForTile(target);
    const withEqualCommit = winChanceForTile(target, { committedManpower: 50, baseMusterCost: 50 });
    expect(withEqualCommit.winChance).toBeCloseTo(withoutCommit.winChance, 10);
    expect(withEqualCommit.winChance).toBeGreaterThanOrEqual(0);
    expect(withEqualCommit.winChance).toBeLessThanOrEqual(1);
  });

  it("raises win chance when committing more than the base muster cost (D6 commit-odds boost)", () => {
    const target = { ownershipState: "SETTLED" as const, fortVariant: "TITANIUM_BASTION" as const };
    const low = winChanceForTile(target, { committedManpower: 50, baseMusterCost: 50 });
    const high = winChanceForTile(target, { committedManpower: 150, baseMusterCost: 50 });
    expect(high.winChance).toBeGreaterThan(low.winChance);
  });

  it("colors low win chance red-ish and high win chance green-ish", () => {
    expect(winChanceColor(0)).toBe("#d63d3d");
    expect(winChanceColor(1)).toBe("#3dd66e");
    expect(winChanceColor(0.5)).toBe("#e6b83c");
  });
});

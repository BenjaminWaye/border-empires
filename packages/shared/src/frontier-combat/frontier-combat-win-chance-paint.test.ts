import { describe, expect, it } from "vitest";
import { findKnownShieldAmount, winChanceColor, winChanceForTile, type KnownShieldFlag } from "./frontier-combat-win-chance-paint.js";
import { SHIELD_RADIUS_TILES } from "../config.js";
import { applyOddsScale } from "./frontier-combat.js";

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

  // Workstream F3: a known shield lowers win chance, mirroring the server's
  // shieldDefenseMultiplier division.
  it("lowers win chance when a known shield covers the target", () => {
    const target = { ownershipState: "SETTLED" as const };
    const unshielded = winChanceForTile(target, { committedManpower: 50, baseMusterCost: 50 });
    const shielded = winChanceForTile(target, { committedManpower: 50, baseMusterCost: 50, knownShieldAmount: 50 });
    expect(shielded.winChance).toBeLessThan(unshielded.winChance);
    // shieldDefenseMultiplier(50, 50) === 2, so the odds ratio is halved.
    expect(shielded.winChance).toBeCloseTo(applyOddsScale(unshielded.winChance, 0.5), 10);
  });

  it("a zero/absent knownShieldAmount is a no-op (matches unshielded)", () => {
    const target = { ownershipState: "SETTLED" as const, fortVariant: "FORT" as const };
    const noField = winChanceForTile(target, { committedManpower: 40, baseMusterCost: 40 });
    const zeroField = winChanceForTile(target, { committedManpower: 40, baseMusterCost: 40, knownShieldAmount: 0 });
    expect(zeroField.winChance).toBeCloseTo(noField.winChance, 10);
  });
});

describe("findKnownShieldAmount", () => {
  const OWNER = "player-a";

  it("returns 0 when the target has no owner", () => {
    const flags: KnownShieldFlag[] = [{ x: 5, y: 5, ownerId: OWNER, mode: "HOLD", amount: 30 }];
    expect(findKnownShieldAmount(5, 5, undefined, flags)).toBe(0);
  });

  it("a HOLD flag shields any tile within SHIELD_RADIUS_TILES (Chebyshev)", () => {
    const flags: KnownShieldFlag[] = [{ x: 10, y: 10, ownerId: OWNER, mode: "HOLD", amount: 30 }];
    const inRangeX = 10 + SHIELD_RADIUS_TILES;
    expect(findKnownShieldAmount(inRangeX, 10, OWNER, flags)).toBe(30);
    expect(findKnownShieldAmount(inRangeX + 1, 10, OWNER, flags)).toBe(0);
  });

  it("any-mode flag shields its own tile regardless of mode", () => {
    const flags: KnownShieldFlag[] = [{ x: 7, y: 7, ownerId: OWNER, mode: "ADVANCE", amount: 15 }];
    expect(findKnownShieldAmount(7, 7, OWNER, flags)).toBe(15);
    // Outside its own tile, an ADVANCE-mode flag provides no area shield.
    expect(findKnownShieldAmount(8, 7, OWNER, flags)).toBe(0);
  });

  it("ignores a flag owned by someone other than the target's owner", () => {
    const flags: KnownShieldFlag[] = [{ x: 5, y: 5, ownerId: "someone-else", mode: "HOLD", amount: 99 }];
    expect(findKnownShieldAmount(5, 5, OWNER, flags)).toBe(0);
  });

  it("picks the largest matching flag when several could shield the same tile (no stacking)", () => {
    const flags: KnownShieldFlag[] = [
      { x: 10, y: 10, ownerId: OWNER, mode: "HOLD", amount: 20 },
      { x: 11, y: 10, ownerId: OWNER, mode: "HOLD", amount: 50 }
    ];
    expect(findKnownShieldAmount(10, 10, OWNER, flags)).toBe(50);
  });
});

import { describe, expect, it } from "vitest";
import { buildFrontierCombatPreview } from "../frontier-combat/frontier-combat.js";
import { CAPTURE_HOLD_DEFENSE_MULT, isCaptureHoldActive, isUndefendedFrontierTile } from "./capture-hold.js";

const NOW = 1_000_000;

describe("capture hold", () => {
  it("is active only on FRONTIER tiles before their deadline", () => {
    expect(isCaptureHoldActive({ ownershipState: "FRONTIER", captureHoldUntil: NOW + 1 }, NOW)).toBe(true);
    expect(isCaptureHoldActive({ ownershipState: "FRONTIER", captureHoldUntil: NOW }, NOW)).toBe(false);
    expect(isCaptureHoldActive({ ownershipState: "FRONTIER" }, NOW)).toBe(false);
    expect(isCaptureHoldActive({ ownershipState: "SETTLED", captureHoldUntil: NOW + 1 }, NOW)).toBe(false);
    expect(isCaptureHoldActive(undefined, NOW)).toBe(false);
  });

  it("treats only FRONTIER without an active hold as undefended", () => {
    expect(isUndefendedFrontierTile({ ownershipState: "FRONTIER" }, NOW)).toBe(true);
    expect(isUndefendedFrontierTile({ ownershipState: "FRONTIER", captureHoldUntil: NOW - 1 }, NOW)).toBe(true);
    expect(isUndefendedFrontierTile({ ownershipState: "FRONTIER", captureHoldUntil: NOW + 1 }, NOW)).toBe(false);
    expect(isUndefendedFrontierTile({ ownershipState: "SETTLED" }, NOW)).toBe(false);
  });

  // Regression: a freshly captured dock landed as FRONTIER with zero defense,
  // so the previous owner retook it at a guaranteed 100%.
  it("gives a freshly captured FRONTIER dock real defense during the hold window", () => {
    const held = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "FRONTIER", dockId: "dock-1", captureHoldUntil: NOW + 60_000 },
      { nowMs: NOW }
    );
    expect(held.defMult).toBe(CAPTURE_HOLD_DEFENSE_MULT);
    expect(held.winChance).toBeCloseTo(0.5, 5);
    expect(held.defender.battle).toContainEqual({ label: "Holding captured ground", mult: CAPTURE_HOLD_DEFENSE_MULT });
  });

  it("does not give a held FRONTIER tile garrison, town or fort bonuses", () => {
    const held = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "FRONTIER", townType: "TOWN", fortVariant: "FORT", captureHoldUntil: NOW + 60_000 },
      { nowMs: NOW }
    );
    expect(held.defMult).toBe(CAPTURE_HOLD_DEFENSE_MULT);
  });

  it("still applies defender infrastructure and breach shock to a held tile", () => {
    const held = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "FRONTIER", captureHoldUntil: NOW + 60_000, breachShockUntil: NOW + 30_000 },
      { nowMs: NOW, titaniumWeaponsFactoryDefenseMult: 1.2 }
    );
    expect(held.defMult).toBeCloseTo(1.2 * CAPTURE_HOLD_DEFENSE_MULT * 0.7, 5);
  });

  it("falls back to zero defense once the hold window has expired", () => {
    const expired = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "FRONTIER", captureHoldUntil: NOW - 1 },
      { nowMs: NOW }
    );
    expect(expired.defMult).toBe(0);
    expect(expired.winChance).toBe(1);
  });
});

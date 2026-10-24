import { describe, expect, it } from "vitest";
import { createLocksFromInitialState } from "./runtime-hydration.js";
import type { RecoveredLock } from "./event-recovery/event-recovery.js";

// The battle squads' cosmetic war gear (runtime-weapons-factory-mults.ts's
// battleWarGearFor) is rolled onto the lock's combat resolution when the
// lock is taken. A lock still in flight across a simulation restart must
// keep it, or the battle it resolves into broadcasts no gear: it renders in
// plain kit, and every client forgets both empires' gear.
const lockWith = (combatResolution: unknown): RecoveredLock => ({
  commandId: "attack-1",
  playerId: "attacker",
  actionType: "ATTACK",
  originX: 5,
  originY: 5,
  targetX: 6,
  targetY: 5,
  originKey: "5,5",
  targetKey: "6,5",
  resolvesAt: 10_000,
  combatResolutionJson: JSON.stringify(combatResolution)
});

const RESULT = { attackerWon: true, atkEff: 1, defEff: 1, winChance: 0.5 };

describe("createLocksFromInitialState -- battle war gear", () => {
  it("keeps both sides' war gear on a recovered lock's combat resolution", () => {
    const locks = createLocksFromInitialState({
      tiles: [],
      activeLocks: [lockWith({ result: RESULT, attackerGear: { titaniumArmor: true }, defenderGear: { umbriteArms: true, titaniumArmor: true } })]
    });
    const resolution = [...locks.values()][0]?.combatResolution;
    expect(resolution?.attackerGear).toEqual({ titaniumArmor: true });
    expect(resolution?.defenderGear).toEqual({ titaniumArmor: true, umbriteArms: true });
  });

  it("drops unknown or non-true gear flags rather than trusting the snapshot", () => {
    const locks = createLocksFromInitialState({
      tiles: [],
      activeLocks: [lockWith({ result: RESULT, attackerGear: { titaniumArmor: "yes", bogus: true }, defenderGear: "titanium" })]
    });
    const resolution = [...locks.values()][0]?.combatResolution;
    expect(resolution).toBeDefined();
    expect(resolution && "attackerGear" in resolution).toBe(false);
    expect(resolution && "defenderGear" in resolution).toBe(false);
  });
});

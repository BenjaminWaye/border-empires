/**
 * Regression test for the AI war reserve (docs/ai-war-peace-balance-plan.md).
 *
 * Bug: EXPAND unlocked at EXPAND_MANPOWER_COST (10) but ATTACK required
 * ATTACK_MANPOWER_MIN (60). An AI spent every point of manpower regen on
 * EXPAND the instant it was affordable, so manpower could mathematically
 * never accumulate to 60 — AI empires had no way to ever fight back,
 * confirmed live against sustained barbarian pressure (2026-09-01).
 *
 * Fix: `canExpand` (and structure-build affordability) now requires manpower
 * above `EXPAND_MANPOWER_COST + aiWarReserveManpower(manpowerCapacity)`, for
 * ai-runtime sessions only — canAttack is untouched, since the reserve
 * exists to be spent attacking, not to sit idle.
 */
import { describe, expect, it } from "vitest";
import { aiWarReserveManpower, EXPAND_MANPOWER_COST } from "@border-empires/shared";

import { planAutomationCommand } from "./automation-command-planner.js";

const makeTile = (x: number, y: number, overrides: Partial<{ ownerId: string; ownershipState: string; resource: string }> = {}) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...overrides
});

describe("automation planner war reserve", () => {
  it("does not propose EXPAND when manpower is above EXPAND_MANPOWER_COST but inside the war reserve", () => {
    const ownedTile = makeTile(10, 10, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const target = makeTile(11, 10, { resource: "FARM" });
    const manpowerCapacity = 720; // STARTING_CAPITAL_MANPOWER_CAP-only empire
    const reserve = aiWarReserveManpower(manpowerCapacity);

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      // Comfortably above EXPAND_MANPOWER_COST alone — this is exactly the
      // live bug: old code would have EXPANDed here every tick.
      manpower: EXPAND_MANPOWER_COST + reserve - 1,
      manpowerCapacity,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [ownedTile],
      ownedTiles: [ownedTile],
      tilesByKey: new Map([
        ["10,10", ownedTile],
        ["11,10", target]
      ]),
      clientSeq: 2,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command?.type).not.toBe("EXPAND");
  });

  it("proposes EXPAND once manpower clears EXPAND_MANPOWER_COST plus the reserve", () => {
    const ownedTile = makeTile(10, 10, { ownerId: "ai-1", ownershipState: "FRONTIER" });
    const target = makeTile(11, 10, { resource: "FARM" });
    const manpowerCapacity = 720;
    const reserve = aiWarReserveManpower(manpowerCapacity);

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: EXPAND_MANPOWER_COST + reserve,
      manpowerCapacity,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [ownedTile],
      ownedTiles: [ownedTile],
      tilesByKey: new Map([
        ["10,10", ownedTile],
        ["11,10", target]
      ]),
      clientSeq: 2,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    expect(result.command?.type).toBe("EXPAND");
  });

  it("does not reserve manpower for system-runtime (barbarian) sessions", () => {
    const ownedTile = makeTile(10, 10, { ownerId: "barbarian-1", ownershipState: "FRONTIER" });
    const target = makeTile(11, 10, { resource: "FARM" });

    const result = planAutomationCommand({
      playerId: "barbarian-1",
      points: 500,
      // Would be inside the war reserve for any real AI cap, but barbarians
      // must never be gated by it.
      manpower: EXPAND_MANPOWER_COST,
      manpowerCapacity: 100_000,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [ownedTile],
      ownedTiles: [ownedTile],
      tilesByKey: new Map([
        ["10,10", ownedTile],
        ["11,10", target]
      ]),
      clientSeq: 2,
      issuedAt: 1000,
      sessionPrefix: "system-runtime"
    });

    expect(result.command?.type).toBe("EXPAND");
  });

  it("leaves canAttack ungated by the reserve — ATTACK stays available down to ATTACK_MANPOWER_MIN alone", () => {
    const ownedTile = makeTile(10, 10, { ownerId: "ai-1", ownershipState: "SETTLED" });
    const enemyTile = makeTile(11, 10, { ownerId: "enemy-1", ownershipState: "SETTLED" });
    const manpowerCapacity = 100_000; // reserve of 10,000 — would block EXPAND hard

    const result = planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower: 60, // exactly ATTACK_MANPOWER_MIN, far below the reserve
      manpowerCapacity,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [ownedTile],
      ownedTiles: [ownedTile],
      tilesByKey: new Map([
        ["10,10", ownedTile],
        ["11,10", enemyTile]
      ]),
      clientSeq: 2,
      issuedAt: 1000,
      sessionPrefix: "ai-runtime"
    });

    // Not asserting ATTACK specifically fires here (that depends on the full
    // utility policy, not just the affordability gate) — asserting only that
    // the command isn't silently dropped to WAIT purely by an
    // attack-manpower gate the reserve was never meant to touch.
    expect(result.diagnostic.canAttack).toBe(true);
  });
});

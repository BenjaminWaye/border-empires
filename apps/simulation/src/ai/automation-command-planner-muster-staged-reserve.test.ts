/**
 * Regression for the muster-vs-build manpower deadlock (staging ai-2,
 * 2026-09-25): the AI war reserve (>= 120) made a 30-manpower Relay Beacon
 * unaffordable unless the pool held ~150, while the muster tick drained the
 * pool into the flag every tick. Manpower already staged in the AI's own flags
 * now counts toward that reserve (the flag is how the reserve gets spent).
 */
import { aiWarReserveManpower, EXPAND_MANPOWER_COST, STRUCTURE_REGISTRY } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { planAutomationCommand } from "./automation-command-planner.js";
import { spendableBuildManpowerForPlanner, spendableManpowerForPlanner } from "./automation-command-planner-war-reserve.js";
import { AI_BUILD_MANPOWER_FLOOR } from "../ai-build-manpower-floor.js";

const CAP = 1_044; // staging ai-2's cap
const RESERVE = aiWarReserveManpower(CAP);

describe("spendableManpowerForPlanner with muster-staged manpower", () => {
  const base = { sessionPrefix: "ai-runtime" as const, manpowerCapacity: CAP };

  it("keeps the full reserve when nothing is staged (unchanged behaviour)", () => {
    expect(spendableManpowerForPlanner({ ...base, manpower: 200 })).toBe(200 - RESERVE);
    expect(spendableManpowerForPlanner({ ...base, manpower: 200, musterStagedManpower: 0 })).toBe(200 - RESERVE);
  });

  it("only reserves the shortfall when the flags hold part of the reserve", () => {
    expect(spendableManpowerForPlanner({ ...base, manpower: 200, musterStagedManpower: 50 })).toBe(200 - (RESERVE - 50));
  });

  it("makes the whole pool spendable once staged manpower covers the reserve, and never goes negative or above the pool", () => {
    expect(spendableManpowerForPlanner({ ...base, manpower: 30, musterStagedManpower: RESERVE })).toBe(30);
    expect(spendableManpowerForPlanner({ ...base, manpower: 30, musterStagedManpower: RESERVE * 10 })).toBe(30);
    expect(spendableManpowerForPlanner({ ...base, manpower: 0, musterStagedManpower: 0 })).toBe(0);
  });

  it("ignores staged manpower outside ai-runtime sessions and without a capacity (no reserve to offset)", () => {
    expect(spendableManpowerForPlanner({ sessionPrefix: "system-runtime", manpowerCapacity: CAP, manpower: 30, musterStagedManpower: 500 })).toBe(30);
    expect(spendableManpowerForPlanner({ sessionPrefix: "ai-runtime", manpower: 30, musterStagedManpower: 500 })).toBe(30);
  });
});

describe("spendableBuildManpowerForPlanner (structure builds may spend the pool floor inside the war reserve)", () => {
  const base = { sessionPrefix: "ai-runtime" as const, manpowerCapacity: CAP };

  it("lets builds spend the pool up to the floor even when the reserve is entirely unmet", () => {
    expect(spendableManpowerForPlanner({ ...base, manpower: 30 })).toBe(0);
    expect(spendableBuildManpowerForPlanner({ ...base, manpower: 30 })).toBe(30);
    expect(spendableBuildManpowerForPlanner({ ...base, manpower: AI_BUILD_MANPOWER_FLOOR + 40 })).toBe(AI_BUILD_MANPOWER_FLOOR);
  });

  it("never exceeds what the war-reserved amount already allows, and never goes negative", () => {
    expect(spendableBuildManpowerForPlanner({ ...base, manpower: 400 })).toBe(400 - RESERVE);
    expect(spendableBuildManpowerForPlanner({ ...base, manpower: 0 })).toBe(0);
    expect(spendableBuildManpowerForPlanner({ ...base, manpower: -5 })).toBe(0);
  });

  it("changes nothing for non-AI sessions or without a capacity", () => {
    expect(spendableBuildManpowerForPlanner({ sessionPrefix: "system-runtime", manpowerCapacity: CAP, manpower: 30 })).toBe(30);
    expect(spendableBuildManpowerForPlanner({ sessionPrefix: "ai-runtime", manpower: 30 })).toBe(30);
  });
});

describe("planAutomationCommand: a full muster flag no longer blocks builds", () => {
  const beaconCost = STRUCTURE_REGISTRY["RELAY_BEACON"]?.cost.manpower ?? Number.NaN;
  // One settled tile; everything around it is undelivered (fog), so the beacon
  // chooser sees a site with unexplored coverage — the same shape as ai-2.
  const plan = (manpower: number, musterStagedManpower: number) => {
    const owned = { x: 100, y: 100, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" as const };
    return planAutomationCommand({
      playerId: "ai-1",
      points: 500,
      manpower,
      manpowerCapacity: CAP,
      musterStagedManpower,
      hasActiveLock: false,
      activeDevelopmentProcessCount: 0,
      frontierTiles: [],
      ownedTiles: [owned],
      tilesByKey: new Map([["100,100", owned]]),
      clientSeq: 1,
      issuedAt: 1_000,
      sessionPrefix: "ai-runtime"
    });
  };

  it("finds a beacon site when the pool holds just the beacon cost and the flag holds the reserve", () => {
    expect(Number.isFinite(beaconCost)).toBe(true);
    expect(plan(beaconCost, RESERVE).diagnostic.relayBeaconBuildCandidate).toBeDefined();
  });

  // ai-2's real steady state (staging, 2026-09-25): the flag fires as soon as it
  // holds a target's cost, so staged hovers around ~17 and never reaches the
  // reserve. The pool floor the muster tick leaves must be spendable anyway.
  it("finds a beacon site at ai-2's state: pool at the beacon cost, flag holding only ~17 of the reserve", () => {
    expect(plan(beaconCost, 16.8).diagnostic.relayBeaconBuildCandidate).toBeDefined();
    expect(plan(beaconCost, 0).diagnostic.relayBeaconBuildCandidate).toBeDefined();
  });

  it("still finds none when the pool cannot cover the beacon's own cost", () => {
    expect(plan(beaconCost - 1, RESERVE).diagnostic.relayBeaconBuildCandidate).toBeUndefined();
    expect(plan(0.2, 16.8).diagnostic.relayBeaconBuildCandidate).toBeUndefined();
  });

  it("leaves EXPAND gated the same way: the pool alone, at the bare EXPAND cost, can spend once the flag covers the reserve", () => {
    const ownedTile = { x: 10, y: 10, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "FRONTIER" as const };
    const target = { x: 11, y: 10, terrain: "LAND" as const, resource: "FARM" };
    const run = (staged: number) =>
      planAutomationCommand({
        playerId: "ai-1",
        points: 500,
        manpower: EXPAND_MANPOWER_COST,
        manpowerCapacity: CAP,
        musterStagedManpower: staged,
        hasActiveLock: false,
        activeDevelopmentProcessCount: 0,
        frontierTiles: [ownedTile],
        ownedTiles: [ownedTile],
        tilesByKey: new Map([["10,10", ownedTile], ["11,10", target]]),
        clientSeq: 2,
        issuedAt: 1_000,
        sessionPrefix: "ai-runtime"
      });
    expect(run(0).command?.type).not.toBe("EXPAND");
    expect(run(RESERVE).command?.type).toBe("EXPAND");
  });
});

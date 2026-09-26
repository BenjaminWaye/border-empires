import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SETTLE_MANPOWER_COST, STRUCTURE_REGISTRY } from "@border-empires/shared";

import { SimulationRuntime } from "./runtime/runtime.js";
import { AI_BUILD_MANPOWER_FLOOR, musterPoolFloorFor } from "./ai-build-manpower-floor.js";

const makePlayer = (id: string, isAi: boolean, manpower: number) => ({
  id,
  isAi,
  points: 10_000,
  manpower,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

// Two identical empires (a TOWN tile lifts the manpower cap well above the
// flag's headroom) each holding one empty flag, differing only in isAi.
const buildRuntime = (poolManpower: number) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["ai-1", makePlayer("ai-1", true, poolManpower)],
      ["player-1", makePlayer("player-1", false, poolManpower)]
    ]),
    initialState: {
      tiles: (["ai-1", "player-1"] as const).flatMap((ownerId, i) => [
        { x: 10, y: 10 + i * 10, terrain: "LAND" as const, ownerId, ownershipState: "SETTLED" as const, muster: { ownerId, amount: 0, mode: "HOLD" as const, updatedAt: 1_000 } },
        { x: 11, y: 10 + i * 10, terrain: "LAND" as const, ownerId, ownershipState: "SETTLED" as const, town: { type: "MARKET" as const, populationTier: "TOWN" as const } }
      ]),
      activeLocks: []
    }
  });

const row = (runtime: SimulationRuntime, id: string) => runtime.exportPlayerDebugSnapshot().find((p) => p.id === id)!;
const flagAmount = (runtime: SimulationRuntime, y: number): number => {
  const tile = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === y);
  return tile?.musterJson ? (JSON.parse(tile.musterJson).amount as number) : 0;
};

describe("AI muster pool floor", () => {
  it("is one full beacon route (frontier SETTLE + beacon build), derived from the shared constants", () => {
    expect(AI_BUILD_MANPOWER_FLOOR).toBe(SETTLE_MANPOWER_COST + (STRUCTURE_REGISTRY["RELAY_BEACON"]?.cost.manpower ?? Number.NaN));
    expect(AI_BUILD_MANPOWER_FLOOR).toBeGreaterThan(0);
    expect(musterPoolFloorFor({ isAi: true })).toBe(AI_BUILD_MANPOWER_FLOOR);
    expect(musterPoolFloorFor({ isAi: false })).toBe(0);
    expect(musterPoolFloorFor({})).toBe(0);
  });

  it("stops an AI flag drawing the pool below the floor, while an identical human flag still drains it", () => {
    // Pool barely above the floor, plenty of flag headroom and rate: the human
    // flag takes everything, the AI flag takes only what sits above the floor.
    const pool = AI_BUILD_MANPOWER_FLOOR + 10;
    const runtime = buildRuntime(pool);
    runtime.tickMuster(1_000 + 60_000);

    // Regen over the minute is <1 manpower, so allow a small tolerance.
    expect(row(runtime, "ai-1").manpower).toBeGreaterThanOrEqual(AI_BUILD_MANPOWER_FLOOR - 0.01);
    expect(flagAmount(runtime, 10)).toBeLessThanOrEqual(10 + 1);
    expect(flagAmount(runtime, 10)).toBeGreaterThan(5);

    expect(row(runtime, "player-1").manpower).toBeLessThan(1);
    expect(flagAmount(runtime, 20)).toBeGreaterThan(pool - 1);
  });

  it("does not draw at all while the AI pool is at or below the floor (so it can accumulate to afford a build)", () => {
    const runtime = buildRuntime(AI_BUILD_MANPOWER_FLOOR - 5);
    runtime.tickMuster(1_000 + 60_000);
    expect(flagAmount(runtime, 10)).toBe(0);
    expect(row(runtime, "ai-1").manpower).toBeGreaterThanOrEqual(AI_BUILD_MANPOWER_FLOOR - 5);
  });
});

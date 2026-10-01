import { describe, expect, it } from "vitest";

import type { SimulationRuntime } from "../runtime/runtime.js";
import { buildAdminPlayerRows } from "./admin-players-snapshot.js";

type DebugRow = ReturnType<SimulationRuntime["exportPlayerDebugSnapshot"]>[number];

const row = (overrides: Partial<DebugRow>): DebugRow =>
  ({
    id: "ai-1",
    name: "AI 1",
    isAi: true,
    points: 80,
    manpower: 40,
    manpowerCap: 150,
    manpowerRegenPerMinute: 5,
    techIds: ["a", "b"],
    domainIds: [],
    resourceSlotSupply: { FOOD: 1, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
    resourceSlotDemand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 },
    shardStockpile: 0,
    settledTileCount: 5,
    ownedTileCount: 9,
    incomePerMinute: 2,
    ...overrides
  }) as DebugRow;

// Only the three runtime methods buildAdminPlayerRows reads; cast once at this seam.
const runtimeWith = (rows: DebugRow[]): SimulationRuntime =>
  ({
    exportPlayerDebugSnapshot: () => rows,
    exportBarbActivationVisibleUnion: () => ({ keys: [] }),
    reachTileCountForPlayer: () => 3
  }) as unknown as SimulationRuntime;

describe("buildAdminPlayerRows", () => {
  it("reports manpower together with its cap", () => {
    const [ai] = buildAdminPlayerRows(runtimeWith([row({})]));
    expect(ai).toEqual(expect.objectContaining({ id: "ai-1", manpower: 40, manpowerCap: 150, techs: 2, frontierTiles: 4, reachTiles: 3 }));
  });
});

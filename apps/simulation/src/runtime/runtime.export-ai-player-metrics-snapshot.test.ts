import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";

// Regression for the per-second metrics ticker (metrics-ai-player-state.ts):
// exportAiPlayerMetricsSnapshot() must (a) only return AI players — human
// players should never show up in sim_ai_player_* Prometheus series — and
// (b) report settled/owned tile counts and income that match what
// exportPlayerDebugSnapshot() (the heavier, sorted/cloned version used by
// /admin/debug/ai) reports, since both read from the same underlying
// per-player summary.
describe("exportAiPlayerMetricsSnapshot", () => {
  const seedPlayer = (id: string) => ({
    id,
    isAi: id.startsWith("ai-"),
    points: id === "ai-1" ? 27_856 : 500,
    manpower: 500,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>(),
    strategicResources: { FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 }
  });

  const buildRuntime = (): SimulationRuntime =>
    new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["ai-1", seedPlayer("ai-1")],
        ["human-1", seedPlayer("human-1")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" },
          { x: 20, y: 20, terrain: "LAND", ownerId: "human-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

  it("only includes AI players, not human players", () => {
    const runtime = buildRuntime();
    const rows = runtime.exportAiPlayerMetricsSnapshot();
    expect(rows.map((row) => row.id)).toEqual(["ai-1"]);
    expect(rows[0]?.isAi).toBe(true);
  });

  it("reports the same points/settled/owned counts as exportPlayerDebugSnapshot for the same player", () => {
    const runtime = buildRuntime();
    const [leanRow] = runtime.exportAiPlayerMetricsSnapshot();
    const debugRow = runtime.exportPlayerDebugSnapshot().find((row) => row.id === "ai-1");

    expect(leanRow).toBeDefined();
    expect(debugRow).toBeDefined();
    expect(leanRow?.points).toBe(debugRow?.points);
    expect(leanRow?.settledTileCount).toBe(debugRow?.settledTileCount);
    expect(leanRow?.ownedTileCount).toBe(debugRow?.ownedTileCount);
    expect(leanRow?.incomePerMinute).toBe(debugRow?.incomePerMinute);
  });
});

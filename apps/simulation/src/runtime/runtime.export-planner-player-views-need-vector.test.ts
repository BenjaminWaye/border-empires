import { describe, expect, it } from "vitest";

import { STARTING_CAPITAL_MANPOWER_CAP, STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE } from "@border-empires/game-domain";
import { SimulationRuntime } from "./runtime.js";
import { testRuntimePlayer } from "./runtime.test-helpers.js";

// Regression for the runtime.ts exportPlannerPlayerViews wiring described in
// docs/ai-structure-building-rewrite-plan.md's Phase 1 entry: the four fields
// (manpowerCapacity, manpowerRegenPerMinute, slotSupplyByResource,
// slotDemandByResource) that feed the AI planner's diagnostic-only
// needVector are threaded through buildRuntimePlannerPlayerViews via closures
// defined here, but there was previously no test pinning that they're
// actually populated with real (not undefined/zeroed) values on the real
// ai-runtime export path — this is what activates the plumbing landed in
// that PR. Kept in its own file: runtime.test.ts is already ~9,000 lines,
// far past the repo's 500-line file cap (scripts/check-file-line-limits.mjs),
// which forbids any further growth to an already-oversized file.
describe("exportPlannerPlayerViews — needVector plumbing (§9)", () => {
  it("populates manpowerCapacity/manpowerRegenPerMinute from the same real per-player calculation exportState/exportPlayerDebugSnapshot use", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([["player-1", testRuntimePlayer("player-1", { points: 500, manpower: 100 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
        activeLocks: []
      }
    });

    const [view] = runtime.exportPlannerPlayerViews(["player-1"]);

    // A settled-but-townless player only has the starting-capital manpower
    // source (STARTING_CAPITAL_MANPOWER_CAP/REGEN_PER_MINUTE,
    // config.ts §4.3) — the same figures playerManpowerCap/
    // playerManpowerRegenPerMinute would report directly, confirming the
    // closures reach the real methods rather than defaulting to 0.
    expect(view?.manpowerCapacity).toBe(STARTING_CAPITAL_MANPOWER_CAP);
    expect(view?.manpowerRegenPerMinute).toBe(STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE);
  });

  it("populates slot supply from an owned FARM tile and zero demand with no structures", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([["player-1", testRuntimePlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 5, y: 5, terrain: "LAND", resource: "FARM", ownerId: "player-1", ownershipState: "SETTLED" }],
        activeLocks: []
      }
    });

    const [view] = runtime.exportPlannerPlayerViews(["player-1"]);

    // BASE_SLOTS_BY_TILE_RESOURCE.FARM (structure-slots.ts §5.2): 1 base FOOD
    // slot per owned FARM tile, no structures built yet so zero demand.
    expect(view?.slotSupplyByResource?.FOOD).toBe(1);
    expect(view?.slotDemandByResource?.FOOD ?? 0).toBe(0);
  });

  it("returns different manpowerCapacity for players with different town counts, not a shared default", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["player-1", testRuntimePlayer("player-1")],
        ["player-2", testRuntimePlayer("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 5,
            y: 5,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { type: "FARMING", populationTier: "TOWN", name: "Player 1 Town" }
          },
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const [player1View, player2View] = runtime.exportPlannerPlayerViews(["player-1", "player-2"]);

    expect(player1View?.manpowerCapacity).toBeGreaterThan(player2View?.manpowerCapacity ?? 0);
  });
});

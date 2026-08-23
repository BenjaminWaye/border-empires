import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// Covers land-gating of NORMAL (TOWN/OUTPOST/DOCK) reach anchors: unlike the
// Aether Bridge's deliberate water-crossing grant (see
// aether-bridge-reach.test.ts), a normal anchor's disk must not flood across
// water to reach land on the far side within its radius -- see
// packages/shared/src/reach/reach.ts's `crossesWater` / land-gating design.
describe("normal reach anchors are land-gated", () => {
  it("does not cross a water gap to reach land on the far side within radius", async () => {
    // A tile the runtime has no state for at all falls back to "assume
    // land" (unmapped, not "known water" -- see SimulationRuntime's
    // isLandTile), so the whole radius-3 box around the town needs real
    // SEA tiles here, not just a single column, or the BFS would just
    // route around the gap through unmapped ground instead of actually
    // being blocked by it.
    const tiles: Array<{ x: number; y: number; terrain: "LAND" | "SEA"; ownerId?: string; ownershipState?: "SETTLED"; town?: { name: string; type: string; populationTier: string } }> = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } }
    ];
    for (let x = -3; x <= 3; x += 1) {
      for (const y of [1, 2]) tiles.push({ x: (x + 450) % 450, y, terrain: "SEA" });
    }
    // TOWN_REACH_RADIUS is 3, so (0,3) is geometrically within radius but
    // only reachable by crossing the water band at y=1..2.
    tiles.push({ x: 0, y: 3, terrain: "LAND" });

    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 20_000, manpower: 10_000 })]
      ]),
      initialState: {
        tiles,
        activeLocks: []
      }
    });
    collectEvents(runtime);

    const reach = new Set(runtime.reachTileKeysForPlayer("player-1"));
    // Coastal edge: the water tile directly adjacent to the town is still
    // included -- water isn't excluded outright, only blocked as a
    // stepping-stone onto further land.
    expect(reach.has("0,1")).toBe(true);
    // The water strip must not act as a stepping-stone onto the land beyond it.
    expect(reach.has("0,2")).toBe(false);
    expect(reach.has("0,3")).toBe(false);
  });

  it("still reaches land connected by an unbroken land path within radius", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { points: 20_000, manpower: 10_000 })]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "LAND" },
          { x: 0, y: 2, terrain: "LAND" },
          { x: 0, y: 3, terrain: "LAND" }
        ],
        activeLocks: []
      }
    });
    collectEvents(runtime);

    const reach = new Set(runtime.reachTileKeysForPlayer("player-1"));
    expect(reach.has("0,3")).toBe(true);
  });
});

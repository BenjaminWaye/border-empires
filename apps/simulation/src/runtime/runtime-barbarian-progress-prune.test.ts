import { describe, expect, it, vi } from "vitest";
import { SimulationRuntime } from "./runtime.js";

const makePlayer = (id: string) => [
  id,
  {
    id,
    isAi: true,
    points: 100,
    manpower: 150,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>()
  }
] as const;

// barbarianTileProgress must stay bounded: an entry is only meaningful while the
// tile is barbarian-owned, so it is dropped when the tile leaves barbarian
// ownership by any route (here: the planner's own erosion, UNCAPTURE_TILE).
describe("barbarian tile progress bookkeeping", () => {
  it("drops a tile's multiply progress when the barbarian releases it", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([makePlayer("barbarian-1")]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    const progress = (runtime as unknown as { barbarianTileProgress: Map<string, number> }).barbarianTileProgress;
    progress.set("10,10", 3);
    progress.set("12,10", 4);

    runtime.submitCommand({
      commandId: "erode-1",
      sessionId: "system-runtime:barbarian-1",
      playerId: "barbarian-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });

    await vi.waitFor(() => expect(progress.has("10,10")).toBe(false));
    expect(progress.get("12,10")).toBe(4);
  });
});

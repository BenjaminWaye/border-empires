import { describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, testRuntimePlayer } from "./runtime.test-helpers.js";

// End-to-end regression for "I spawned and barbarians were all over my
// territory, and my AFC had no reach on one side": the only open tile on a
// barbarian-held island is the spawn tile, and a barbarian-held town sits
// just past the AFC's radius-3 reach (so its own radius-3 disk overlaps the
// AFC's). After landing, the AFC's whole 7x7 must be the player's and the
// barbarians inside it gone; barbarians beyond it stay.
const SPAWN = { x: 10, y: 10 };
const barbTile = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "barbarian-1",
  ownershipState: "SETTLED",
  ...extra
});

const buildIsland = (): DomainTileState[] => {
  const tiles: DomainTileState[] = [];
  for (let y = 0; y <= 20; y += 1) {
    for (let x = 0; x <= 20; x += 1) {
      if (x === SPAWN.x && y === SPAWN.y) tiles.push({ x, y, terrain: "LAND" });
      else if (x === 15 && y === 10) tiles.push(barbTile(x, y, { town: { type: "FARMING", populationTier: "SETTLEMENT" } }));
      else tiles.push(barbTile(x, y));
    }
  }
  return tiles;
};

describe("AFC landing among barbarians", () => {
  it("clears barbarians in the AFC's reach and grants the full reach disk despite a barbarian town just outside it", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["barbarian-1", buildPlayer("barbarian-1")]]),
      seedTiles: new Map(),
      initialState: { tiles: buildIsland(), activeLocks: [] }
    });

    expect(runtime.ensurePlayerHasSpawnTerritory("newcomer")).toBe(true);

    const tiles = runtime.exportState().tiles;
    const byKey = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
    const chebyshev = (tile: { x: number; y: number }) => Math.max(Math.abs(tile.x - SPAWN.x), Math.abs(tile.y - SPAWN.y));

    const barbariansInReach = tiles.filter((tile) => tile.ownerId === "barbarian-1" && chebyshev(tile) <= 3);
    expect(barbariansInReach).toEqual([]);

    const owned = tiles.filter((tile) => tile.ownerId === "newcomer");
    expect(owned).toHaveLength(49);
    expect(byKey.get("10,10")?.afcJson).toBeDefined();
    expect(owned.every((tile) => chebyshev(tile) <= 3)).toBe(true);

    // The barbarians beyond the AFC's reach are untouched -- including the town.
    expect(byKey.get("14,10")?.ownerId).toBe("barbarian-1");
    expect(byKey.get("15,10")?.ownerId).toBe("barbarian-1");
  });

  // The elimination-respawn path (respawnIfEliminated) lands an AFC the same way a fresh spawn does and must
  // clear barbarians too. Real flow: the player's only tile falls to a barbarian counter-capture, they are
  // eliminated and respawn on the tile the barbarian just walked off, right beside the barbarian that took
  // their old tile -- which the landing then releases.
  it("clears barbarians in reach when an eliminated player respawns", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    try {
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        scheduleAfter: (delayMs, task) => {
          scheduledTasks.push({ delayMs, task });
        },
        initialPlayers: new Map([
          ["player-1", testRuntimePlayer("player-1")],
          ["barbarian-1", buildPlayer("barbarian-1", { isAi: true, points: Number.MAX_SAFE_INTEGER, manpower: Number.MAX_SAFE_INTEGER })]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 11, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }
          ],
          activeLocks: []
        }
      });
      runtime.submitCommand({
        commandId: "eliminated-respawn",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      expect(scheduledTasks).toHaveLength(1);
      scheduledTasks[0]?.task();

      const tiles = runtime.exportState().tiles;
      const afc = tiles.find((tile) => tile.ownerId === "player-1" && tile.afcJson);
      expect(afc).toBeDefined();
      const nearbyBarbarians = tiles.filter(
        (tile) => tile.ownerId === "barbarian-1" && Math.max(Math.abs(tile.x - afc!.x), Math.abs(tile.y - afc!.y)) <= 3
      );
      expect(nearbyBarbarians).toEqual([]);
    } finally {
      randomSpy.mockRestore();
    }
  });
});

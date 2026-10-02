import { describe, expect, it, vi } from "vitest";
import { FRONTIER_CLAIM_MS } from "@border-empires/shared";
import { SimulationRuntime } from "./runtime.js";

const makePlayer = (id: string, allies: string[] = []) => [
  id,
  {
    id,
    isAi: id.startsWith("ai-"),
    points: 100,
    manpower: 150,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>(allies)
  }
] as const;

type TileSeed = { x: number; y: number; ownerId?: string; ownershipState?: "SETTLED" | "FRONTIER"; town?: { name: string; type: "FARMING"; populationTier: "TOWN" } };

const makeRuntime = (players: ReadonlyArray<ReturnType<typeof makePlayer>>, tiles: TileSeed[]) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map(players),
    seedTiles: new Map(),
    initialState: {
      tiles: tiles.map((t) => ({ terrain: "LAND" as const, ...t })),
      activeLocks: []
    }
  });

const barb = (x: number, y: number): TileSeed => ({ x, y, ownerId: "barbarian-1", ownershipState: "SETTLED" });
const settled = (x: number, y: number, ownerId: string): TileSeed => ({ x, y, ownerId, ownershipState: "SETTLED" });

// A barb tile may act only while some non-barb player can actually see it. This
// reads the same coverage the client's fog of war is built from (see
// runtime-barb-activation-vision.ts), so it cannot drift from what players see.
describe("runtime.exportBarbTilesSeenByAnyPlayer", () => {
  it("includes only barb tiles inside a non-barb player's vision", () => {
    const runtime = makeRuntime(
      [makePlayer("player-1"), makePlayer("player-2"), makePlayer("barbarian-1")],
      [settled(50, 50, "player-1"), settled(200, 200, "player-2"), barb(51, 51), barb(100, 100)]
    );
    const seen = runtime.exportBarbTilesSeenByAnyPlayer();
    expect(seen).toEqual(["51,51"]);
  });

  it("a FRONTIER claim only reveals its 1-tile halo, matching what the player sees", () => {
    const runtime = makeRuntime(
      [makePlayer("player-1"), makePlayer("barbarian-1")],
      [{ x: 50, y: 50, ownerId: "player-1", ownershipState: "FRONTIER" }, barb(51, 50), barb(52, 50)]
    );
    expect(runtime.exportBarbTilesSeenByAnyPlayer()).toEqual(["51,50"]);
  });

  it("a SETTLED town's +1 ring makes barb tiles visible one extra tile out", () => {
    const runtime = makeRuntime(
      [makePlayer("player-1"), makePlayer("barbarian-1")],
      [
        { x: 50, y: 50, ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "FARMING", populationTier: "TOWN" } },
        settled(60, 60, "player-1"),
        barb(52, 52), // via the town's +1 ring
        barb(62, 62) // outside the plain tile's radius
      ]
    );
    const seen = runtime.exportBarbTilesSeenByAnyPlayer();
    expect(seen).toContain("52,52");
    expect(seen).not.toContain("62,62");
  });

  it("an ally's vision counts, like it does for the client's fog", () => {
    const runtime = makeRuntime(
      [makePlayer("player-1", ["player-2"]), makePlayer("player-2", ["player-1"]), makePlayer("barbarian-1")],
      [settled(50, 50, "player-2"), barb(51, 50)]
    );
    expect(runtime.exportBarbTilesSeenByAnyPlayer()).toEqual(["51,50"]);
  });

  it("is empty with no barbarian tiles, and ignores barbarian-owned vision", () => {
    const none = makeRuntime([makePlayer("player-1"), makePlayer("barbarian-1")], [settled(5, 5, "player-1")]);
    expect(none.exportBarbTilesSeenByAnyPlayer()).toEqual([]);
    const onlyBarbs = makeRuntime(
      [makePlayer("barbarian-1"), makePlayer("barbarian-2" as never)],
      [barb(10, 10), { x: 11, y: 10, ownerId: "barbarian-2", ownershipState: "SETTLED" }]
    );
    expect(onlyBarbs.exportBarbTilesSeenByAnyPlayer()).toEqual([]);
  });

  it("follows live ownership changes without any signature or cache", async () => {
    vi.useFakeTimers();
    try {
      const runtime = makeRuntime(
        [makePlayer("player-1"), makePlayer("barbarian-1")],
        [settled(50, 50, "player-1"), { x: 51, y: 50 }, barb(53, 50), barb(52, 50)]
      );
      expect(runtime.exportBarbTilesSeenByAnyPlayer()).toEqual([]);
      runtime.submitCommand({
        commandId: "c1",
        sessionId: "s",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "EXPAND",
        payloadJson: JSON.stringify({ fromX: 50, fromY: 50, toX: 51, toY: 50 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(FRONTIER_CLAIM_MS + 100);
      // The player now owns (51,50), which borders the barbarian at (52,50).
      expect(runtime.exportBarbTilesSeenByAnyPlayer()).toEqual(["52,50"]); // not (53,50): FRONTIER only reveals a 1-tile halo
    } finally {
      vi.useRealTimers();
    }
  });
});

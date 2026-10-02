import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

/**
 * Regression: abandoning (UNCAPTURE_TILE) your own Automated Fabrication
 * Complex used to succeed. That vacated the AFC's TOWN-radius reach disk, so
 * every frontier tile around it was stamped "Beyond your reach" and started
 * decaying, while the AFC itself (modules included) sat inert on neutral
 * land. It is now rejected like abandoning a SETTLEMENT.
 */

const afcRuntime = (afcOwnerId: string) => {
  let nowMs = 1_000;
  const runtime = new SimulationRuntime({
    now: () => nowMs,
    scheduleAfter: () => undefined,
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", afc: { ownerId: afcOwnerId, status: "active", activatedAt: 0, modules: ["m1"] } },
        { x: 21, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 22, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 23, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Town", type: "FARMING", populationTier: "TOWN" } },
        // Frontier ring covered only by the AFC's reach (the town at x=23 reaches x>=20).
        { x: 19, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
        { x: 18, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
        { x: 17, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
        // Keeps the ring supply-connected without going through the AFC tile.
        ...[17, 18, 19, 20, 21, 22, 23].map((x) => ({ x, y: 21, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const }))
      ],
      activeLocks: []
    }
  });
  const events = collectEvents(runtime);
  const abandonAfc = async (): Promise<void> => {
    runtime.submitCommand({
      commandId: "abandon-afc",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: nowMs,
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: 20, y: 20 })
    });
    await Promise.resolve();
  };
  return { runtime, events, abandonAfc };
};

describe("UNCAPTURE_TILE on an Automated Fabrication Complex", () => {
  it("rejects abandoning your own AFC and leaves its frontier ring in reach", async () => {
    const { runtime, events, abandonAfc } = afcRuntime("player-1");

    await abandonAfc();

    expect(events).toContainEqual(
      expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "abandon-afc", code: "UNCAPTURE_AFC" })
    );
    const afcTile = runtime.wireDeltaForTileKey("20,20", "player-1");
    expect(afcTile?.ownerId).toBe("player-1");
    expect(afcTile?.ownershipState).toBe("SETTLED");
    for (const key of ["19,20", "18,20", "17,20"]) {
      expect(runtime.wireDeltaForTileKey(key, "player-1")?.frontierDecayKind).toBeUndefined();
      expect(runtime.reachTileKeysForPlayer("player-1")).toContain(key);
    }
  });

  it("still lets you abandon a tile carrying another player's inert AFC", async () => {
    const { runtime, events, abandonAfc } = afcRuntime("player-2");

    await abandonAfc();

    expect(events.some((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "abandon-afc")).toBe(false);
    expect(runtime.wireDeltaForTileKey("20,20", "player-1")?.ownerId).toBeUndefined();
  });
});

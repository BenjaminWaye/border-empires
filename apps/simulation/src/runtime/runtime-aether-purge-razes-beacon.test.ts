import { describe, expect, it } from "vitest";
import { RAZED_WRECK_DURATION_MS } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Aether Purge razes the target's Relay Beacon the same way capture and
// abandon do (capture-structures.ts). Before this, a finished beacon stayed
// standing on the neutral tile, and a half-built one sat at
// under_construction forever: completion bails once the tile has no owner.
const NOW = 1_000;

const purge = async (economicStructure: NonNullable<DomainTileState["economicStructure"]>, town?: DomainTileState["town"]) => {
  const runtime = new SimulationRuntime({
    now: () => NOW,
    seedTiles: new Map(),
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 5_000, manpower: 10_000, techIds: new Set<string>(["crystal-lattices"]), strategicResources: { CRYSTAL: 500 } })],
      ["player-2", buildPlayer("player-2", { manpower: 100 })]
    ]),
    initialState: {
      tiles: [
        { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" } },
        { x: 5, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", economicStructure, ...(town ? { town } : {}) },
        // §5.4: CRYSTAL supply so player-1's Observatory isn't dormant.
        { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" }
      ],
      activeLocks: []
    }
  });
  runtime.submitCommand({
    commandId: "aether-purge-beacon",
    sessionId: "session-1",
    playerId: "player-1",
    clientSeq: 1,
    issuedAt: NOW,
    type: "AETHER_LANCE",
    payloadJson: JSON.stringify({ x: 5, y: 0 })
  });
  await Promise.resolve();
  return { tile: runtime.exportState().tiles.find((tile) => tile.x === 5 && tile.y === 0), runtime };
};

describe("Aether Purge razes Relay Beacons", () => {
  it("destroys a finished beacon and leaves its wreck", async () => {
    const { tile } = await purge({ ownerId: "player-2", type: "RELAY_BEACON", status: "active" });
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.economicStructureJson).toBeUndefined();
    expect(tile?.razedWreck).toBe("RELAY_BEACON");
    expect(tile?.razedWreckUntil).toBe(NOW + RAZED_WRECK_DURATION_MS);
  });

  it("attributes a town left unclaimed by the strike to the attacking House", async () => {
    const { runtime } = await purge(
      { ownerId: "player-2", type: "RELAY_BEACON", status: "active" },
      { type: "MARKET", name: "Ashhaven", populationTier: "TOWN" }
    );
    expect(runtime.getPersonalActivityTimeline("player-2", 0, NOW).cards).toContainEqual(
      expect.objectContaining({ kind: "TOWN_LOST", townName: "Ashhaven", counterpartyPlayerId: "player-1", lostToStrike: true })
    );
  });

  it("clears a beacon that was still under construction", async () => {
    const { tile } = await purge({ ownerId: "player-2", type: "RELAY_BEACON", status: "under_construction", startedAt: 0, completesAt: NOW + 60_000 });
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.economicStructureJson).toBeUndefined();
    expect(tile?.razedWreck).toBeUndefined();
  });
});

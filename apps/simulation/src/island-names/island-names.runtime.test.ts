import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";

// End-to-end through the real runtime: NAME_ISLAND is dispatched, the claim
// lands on the player, and it survives a snapshot -> cold boot round trip.
const humanPlayer = (id: string) => ({
  id,
  isAi: false,
  points: 1_000,
  manpower: 1_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

// A 4x3 garrisoned island at (30..33, 40..42); everything else is sea.
const islandTiles = () => {
  const tiles = [];
  for (let y = 40; y <= 42; y += 1) {
    for (let x = 30; x <= 33; x += 1) tiles.push({ x, y, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "SETTLED" as const });
  }
  return tiles;
};

describe("island naming in the runtime", () => {
  it("names a fully garrisoned island and keeps the name across a snapshot round trip", async () => {
    const seen: SimulationEvent[] = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", humanPlayer("player-1")]]),
      seedTiles: new Map(),
      initialState: { tiles: islandTiles(), activeLocks: [] }
    });
    runtime.onEvent((event) => seen.push(event));
    runtime.submitCommand({
      commandId: "name-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "NAME_ISLAND",
      payloadJson: JSON.stringify({ x: 31, y: 41, name: "Isle of Waypoint" })
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen.find((event) => event.eventType === "COMMAND_REJECTED")).toBeUndefined();
    const pushed = seen.find((event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "ISLAND_NAMES");
    expect(pushed).toBeDefined();
    const claim = { islandId: "30,40", name: "Isle of Waypoint", namedAt: 1_000 };
    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.islandNames).toEqual([claim]);

    const sections = runtime.exportSnapshotSections();
    const restarted = new SimulationRuntime({ now: () => 2_000, seedTiles: new Map(), initialState: sections.initialState });
    expect(restarted.exportState().players.find((player) => player.id === "player-1")?.islandNames).toEqual([claim]);
  });
});

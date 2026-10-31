import { afterEach, describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// player-1 holds dock-a at (10,10). It links to neutral dock-b at (50,50),
// whose harbour has sea to the north and west: (50,51) is a beach beside the
// linked dock (water on its west side), (51,50) is inland land beside it.
const harbourTiles = (extra: DomainTileState[] = []): DomainTileState[] => [
  { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" },
  { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" },
  { x: 50, y: 49, terrain: "SEA" },
  { x: 49, y: 50, terrain: "SEA" },
  { x: 49, y: 51, terrain: "SEA" },
  { x: 50, y: 51, terrain: "LAND" },
  { x: 51, y: 50, terrain: "LAND" },
  { x: 51, y: 51, terrain: "LAND" },
  { x: 51, y: 49, terrain: "LAND" },
  { x: 52, y: 50, terrain: "LAND" },
  { x: 52, y: 51, terrain: "LAND" },
  { x: 50, y: 52, terrain: "LAND" },
  { x: 51, y: 52, terrain: "LAND" },
  ...extra
];

const buildRuntime = (tiles: DomainTileState[]) =>
  new SimulationRuntime({
    now: () => 1_000,
    seedTiles: new Map(),
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })],
      ["barbarian-1", buildPlayer("barbarian-1", { points: 10_000, manpower: 10_000 })]
    ]),
    initialState: {
      tiles,
      docks: [
        { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
        { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
      ],
      activeLocks: []
    }
  });

const expand = (commandId: string, clientSeq: number, from: { x: number; y: number }, to: { x: number; y: number }, playerId = "player-1") => ({
  commandId,
  sessionId: "session-1",
  playerId,
  clientSeq,
  issuedAt: 1_000,
  type: "EXPAND" as const,
  payloadJson: JSON.stringify({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y })
});

const outcome = (seen: SimulationEvent[], commandId: string): SimulationEvent | undefined =>
  seen.find((event) => (event.eventType === "COMMAND_ACCEPTED" || event.eventType === "COMMAND_REJECTED") && event.commandId === commandId);

afterEach(() => {
  vi.useRealTimers();
});

describe("dock beach landings", () => {
  it("accepts a crossing onto a beach beside the linked dock (was NOT_ADJACENT before beach landings)", async () => {
    const runtime = buildRuntime(harbourTiles());
    const seen = collectEvents(runtime);
    runtime.submitCommand(expand("beach", 1, { x: 10, y: 10 }, { x: 50, y: 51 }));
    await Promise.resolve();
    expect(outcome(seen, "beach")?.eventType).toBe("COMMAND_ACCEPTED");
  });

  it("still rejects a crossing onto inland ground beside the linked dock", async () => {
    const runtime = buildRuntime(harbourTiles());
    const seen = collectEvents(runtime);
    runtime.submitCommand(expand("inland", 1, { x: 10, y: 10 }, { x: 51, y: 50 }));
    await Promise.resolve();
    const event = outcome(seen, "inland");
    expect(event?.eventType).toBe("COMMAND_REJECTED");
    expect(event && "code" in event ? event.code : undefined).toBe("NOT_ADJACENT");
  });

  it("accepts a barbarian beach landing from a barbarian-held dock", async () => {
    const runtime = buildRuntime(
      harbourTiles().map((tile) =>
        tile.x === 10 && tile.y === 10 ? { ...tile, ownerId: "barbarian-1", ownershipState: "BARBARIAN" as const } : tile
      )
    );
    const seen = collectEvents(runtime);
    runtime.submitCommand(expand("barb-beach", 1, { x: 10, y: 10 }, { x: 50, y: 51 }, "barbarian-1"));
    await Promise.resolve();
    expect(outcome(seen, "barb-beach")?.eventType).toBe("COMMAND_ACCEPTED");
  });

  it("finds the home dock for a stale-origin beach crossing", async () => {
    const runtime = buildRuntime(harbourTiles([{ x: 999, y: 999, terrain: "LAND" }]));
    const seen = collectEvents(runtime);
    runtime.submitCommand(expand("stale", 1, { x: 999, y: 999 }, { x: 50, y: 51 }));
    await Promise.resolve();
    expect(outcome(seen, "stale")?.eventType).toBe("COMMAND_ACCEPTED");
  });

  it("keeps a landed beach supplied through the home dock, so it can launch the next step inland", async () => {
    vi.useFakeTimers();
    const runtime = buildRuntime(
      harbourTiles().map((tile) =>
        tile.x === 50 && tile.y === 51 ? { ...tile, ownerId: "player-1", ownershipState: "FRONTIER" as const } : tile
      )
    );
    const seen = collectEvents(runtime);
    // (51,52) is adjacent to the beach only. Without the sea lane the beach
    // has no supply path at all, so launching from it released it and
    // failed with ORIGIN_CUT_OFF.
    runtime.submitCommand(expand("inland-step", 1, { x: 50, y: 51 }, { x: 51, y: 52 }));
    await Promise.resolve();
    expect(outcome(seen, "inland-step")?.eventType).toBe("COMMAND_ACCEPTED");
    expect(runtime.exportState().tiles.find((tile) => tile.x === 50 && tile.y === 51)?.ownerId).toBe("player-1");
  });
});

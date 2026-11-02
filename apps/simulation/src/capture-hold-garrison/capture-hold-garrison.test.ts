// A tile captured in battle can't be garrisoned while the capturing troops
// still hold it (shared capture-hold.ts): its fort stays down, its resource
// and dock pay nothing. startSettlementProcess floors the garrison time at the
// hold's end; these are the other ways a tile could become SETTLED early.
import { describe, expect, it, vi } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { CAPTURE_HOLD_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";
import { applyAutoFill } from "../runtime-auto-fill.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

const NOW = 1_000;
const held = { ownerId: "player-1", ownershipState: "FRONTIER", captureHoldUntil: NOW + CAPTURE_HOLD_MS } as const;

const runtimeWith = (tiles: DomainTileState[], player = buildPlayer("player-1", { points: 500, manpower: 10_000 })) =>
  new SimulationRuntime({ now: () => NOW, initialPlayers: new Map([["player-1", player]]), initialState: { tiles, activeLocks: [] } });

const command = (commandId: string, type: string, x: number, y: number, clientSeq: number) =>
  ({ commandId, sessionId: "session-1", playerId: "player-1", clientSeq, issuedAt: NOW, type, payloadJson: JSON.stringify({ x, y }) }) as Parameters<SimulationRuntime["submitCommand"]>[0];

describe("a held tile can't be garrisoned early", () => {
  it("refuses to rush-buy the garrison of a tile still held", async () => {
    vi.useFakeTimers();
    try {
      const runtime = runtimeWith([
        { x: 10, y: 10, terrain: "LAND", ...held },
        { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } }
      ]);
      const events = collectEvents(runtime);
      runtime.submitCommand(command("settle-1", "SETTLE", 10, 10, 1));
      await Promise.resolve();
      runtime.submitCommand(command("rush-1", "RUSH_BUY", 10, 10, 2));
      await Promise.resolve();
      expect(events.some((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "rush-1")).toBe(true);
      expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.ownershipState).toBe("FRONTIER");
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a held tile out of a sealed pocket's auto-fill", () => {
    const own = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({ x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", ...extra });
    const capturedTile = own(1, 2);
    const tiles = new Map<string, DomainTileState>([
      [simulationTileKey(0, 1), own(0, 1)],
      [simulationTileKey(1, 0), own(1, 0)],
      [simulationTileKey(1, 2), capturedTile],
      [simulationTileKey(2, 0), own(2, 0)],
      [simulationTileKey(2, 2), own(2, 2)],
      [simulationTileKey(3, 1), own(3, 1)],
      [simulationTileKey(1, 1), own(1, 1, { ownershipState: "FRONTIER", captureHoldUntil: NOW + CAPTURE_HOLD_MS })],
      [simulationTileKey(2, 1), own(2, 1, { ownershipState: "FRONTIER" })]
    ]);
    const settled = applyAutoFill({ capturedTile, ownerId: "player-1", tiles, replaceTileState: () => undefined, isInReach: () => true, now: NOW });
    expect(settled.map((tile) => `${tile.x},${tile.y}`)).toEqual(["2,1"]);
  });

  it("won't drop a free replacement AFC onto a tile still held", async () => {
    const runtime = runtimeWith([{ x: 15, y: 14, terrain: "LAND", ...held }]);
    const events = collectEvents(runtime);
    runtime.submitCommand(command("rebuild-afc", "BUILD_AFC", 15, 14, 1));
    await Promise.resolve();
    expect(events.some((event) => event.eventType === "COMMAND_REJECTED" && event.commandId === "rebuild-afc")).toBe(true);
    expect(runtime.exportState().tiles.find((t) => t.x === 15 && t.y === 14)?.ownershipState).toBe("FRONTIER");
  });
});

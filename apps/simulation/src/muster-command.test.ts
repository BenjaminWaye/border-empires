import { describe, expect, it, vi } from "vitest";

// Enable the muster system before any module (config.ts) is imported.
vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 10_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const buildRuntime = () =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")]
    ]),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
      ],
      activeLocks: []
    }
  });

const muster = (tiles: ReturnType<SimulationRuntime["exportState"]>["tiles"], x: number, y: number) => {
  const tile = tiles.find((entry) => entry.x === x && entry.y === y);
  return tile?.musterJson ? JSON.parse(tile.musterJson) : undefined;
};

describe("muster commands", () => {
  it("SET_MUSTER on an owned LAND tile sets tile.muster", async () => {
    const runtime = buildRuntime();
    runtime.submitCommand({
      commandId: "set-muster-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10, mode: "HOLD" })
    });
    await Promise.resolve();
    const m = muster(runtime.exportState().tiles, 10, 10);
    expect(m).toMatchObject({ ownerId: "player-1", amount: 0, mode: "HOLD" });
  });

  it("CLEAR_MUSTER removes tile.muster", async () => {
    const runtime = buildRuntime();
    runtime.submitCommand({
      commandId: "set-muster-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10, mode: "ADVANCE" })
    });
    await Promise.resolve();
    expect(muster(runtime.exportState().tiles, 10, 10)).toBeDefined();

    runtime.submitCommand({
      commandId: "clear-muster-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "CLEAR_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();
    expect(muster(runtime.exportState().tiles, 10, 10)).toBeUndefined();
  });

  it("SET_MUSTER on an enemy tile is rejected", async () => {
    const runtime = buildRuntime();
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.submitCommand({
      commandId: "set-muster-enemy",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 11, y: 10, mode: "HOLD" })
    });
    await Promise.resolve();
    expect(muster(runtime.exportState().tiles, 11, 10)).toBeUndefined();
    const rejected = seen.find(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> =>
        event.eventType === "COMMAND_REJECTED" && event.commandId === "set-muster-enemy"
    );
    expect(rejected?.code).toBe("MUSTER_INVALID");
  });
});

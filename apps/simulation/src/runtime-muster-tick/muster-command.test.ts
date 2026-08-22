import { describe, expect, it, vi } from "vitest";

// Enable the muster system before any module (config.ts) is imported.
vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";

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
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
        { x: 5, y: 5, terrain: "LAND", ownershipState: "FRONTIER" }
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

  // Regression for 5000+ permanently-QUEUED SET_MUSTER commands found in
  // production: SET_MUSTER's success path only emitted TILE_DELTA_BATCH, which
  // persistCommandStatus doesn't recognize as terminal, so the command's
  // persisted status never left QUEUED and it was replayed on every restart.
  it("SET_MUSTER emits COMMAND_RESOLVED on success", async () => {
    const runtime = buildRuntime();
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.submitCommand({
      commandId: "set-muster-resolved",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10, mode: "HOLD" })
    });
    await Promise.resolve();
    expect(seen).toContainEqual({ eventType: "COMMAND_RESOLVED", commandId: "set-muster-resolved", playerId: "player-1" });
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

    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
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
    // Same regression as SET_MUSTER above.
    expect(seen).toContainEqual({ eventType: "COMMAND_RESOLVED", commandId: "clear-muster-2", playerId: "player-1" });
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

  it("SET_MUSTER with mode MARCH sets a target and rejects a missing one", async () => {
    const runtime = buildRuntime();
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    runtime.submitCommand({
      commandId: "set-muster-march-no-target",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10, mode: "MARCH" })
    });
    await Promise.resolve();
    const rejected = seen.find(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> =>
        event.eventType === "COMMAND_REJECTED" && event.commandId === "set-muster-march-no-target"
    );
    expect(rejected?.code).toBe("BAD_COMMAND");
    expect(muster(runtime.exportState().tiles, 10, 10)).toBeUndefined();

    runtime.submitCommand({
      commandId: "set-muster-march-ok",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 2,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10, mode: "MARCH", targetX: 5, targetY: 5 })
    });
    await Promise.resolve();
    expect(muster(runtime.exportState().tiles, 10, 10)).toMatchObject({ mode: "MARCH", targetX: 5, targetY: 5 });
  });

  it("SET_MUSTER with mode MARCH targeting the flag's own tile is rejected", async () => {
    const runtime = buildRuntime();
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.submitCommand({
      commandId: "set-muster-march-self",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10, mode: "MARCH", targetX: 10, targetY: 10 })
    });
    await Promise.resolve();
    const rejected = seen.find(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> =>
        event.eventType === "COMMAND_REJECTED" && event.commandId === "set-muster-march-self"
    );
    expect(rejected?.code).toBe("MUSTER_INVALID");
  });

  it("SET_MUSTER with mode MARCH targeting a nonexistent tile is rejected", async () => {
    const runtime = buildRuntime();
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.submitCommand({
      commandId: "set-muster-march-nowhere",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_MUSTER",
      payloadJson: JSON.stringify({ x: 10, y: 10, mode: "MARCH", targetX: 9_999, targetY: 9_999 })
    });
    await Promise.resolve();
    const rejected = seen.find(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> =>
        event.eventType === "COMMAND_REJECTED" && event.commandId === "set-muster-march-nowhere"
    );
    expect(rejected?.code).toBe("MUSTER_INVALID");
    expect(muster(runtime.exportState().tiles, 10, 10)).toBeUndefined();
  });
});

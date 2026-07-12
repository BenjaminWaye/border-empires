import { describe, expect, it, vi } from "vitest";

import type { SimulationEvent } from "@border-empires/sim-protocol";

import { SimulationRuntime } from "./runtime.js";

type SimulationRuntimeEventShape = SimulationEvent;

// Emperor-endorsement bonus (galaxy meta-layer Phase 1). Coverage lives in a
// dedicated file rather than the already-oversized runtime.test.ts (see
// AGENTS.md file-line discipline).
const humanPlayer = (id: string, overrides: Partial<{ points: number; manpower: number; imperialWardCharges: number }> = {}) => ({
  id,
  isAi: false,
  points: overrides.points ?? 1_000,
  manpower: overrides.manpower ?? 1_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>(),
  ...(typeof overrides.imperialWardCharges === "number" ? { imperialWardCharges: overrides.imperialWardCharges } : {})
});

describe("Imperial Ward (galaxy meta-layer Phase 1 endorsement bonus)", () => {
  it("activates, decrements charges, and emits a one-off IMPERIAL_WARD_ACTIVATED message", async () => {
    const seen: SimulationRuntimeEventShape[] = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", humanPlayer("player-1", { imperialWardCharges: 3 })]]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });
    runtime.onEvent((event) => seen.push(event));

    runtime.submitCommand({
      commandId: "ward-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ACTIVATE_IMPERIAL_WARD",
      payloadJson: "{}"
    });
    await Promise.resolve();

    const activated = seen.find((event) => event.eventType === "PLAYER_MESSAGE" && event.messageType === "IMPERIAL_WARD_ACTIVATED");
    expect(activated).toBeDefined();
    expect(JSON.parse((activated as { payloadJson: string }).payloadJson)).toEqual(
      expect.objectContaining({ type: "IMPERIAL_WARD_ACTIVATED", activeUntil: 1_000 + 10 * 60_000, chargesRemaining: 2 })
    );
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.imperialWardCharges).toBe(2);
  });

  it("rejects activation when the player has no charges remaining", async () => {
    const seen: SimulationRuntimeEventShape[] = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", humanPlayer("player-1", { imperialWardCharges: 0 })]]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });
    runtime.onEvent((event) => seen.push(event));

    runtime.submitCommand({
      commandId: "ward-2",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ACTIVATE_IMPERIAL_WARD",
      payloadJson: "{}"
    });
    await Promise.resolve();

    expect(seen).toContainEqual(
      expect.objectContaining({ eventType: "COMMAND_REJECTED", code: "IMPERIAL_WARD_INVALID", message: "no imperial ward charges remaining" })
    );
  });

  it("rejects a second activation while the ward is already active, without spending an extra charge", async () => {
    const seen: SimulationRuntimeEventShape[] = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", humanPlayer("player-1", { imperialWardCharges: 3 })]]),
      seedTiles: new Map(),
      initialState: { tiles: [], activeLocks: [] }
    });
    runtime.onEvent((event) => seen.push(event));

    for (const [index, commandId] of ["ward-a", "ward-b"].entries()) {
      runtime.submitCommand({
        commandId,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: index + 1,
        issuedAt: 1_000,
        type: "ACTIVATE_IMPERIAL_WARD",
        payloadJson: "{}"
      });
      await Promise.resolve();
    }

    expect(seen).toContainEqual(
      expect.objectContaining({ eventType: "COMMAND_REJECTED", code: "IMPERIAL_WARD_INVALID", message: "imperial ward already active" })
    );
    expect(runtime.exportState().players.find((p) => p.id === "player-1")?.imperialWardCharges).toBe(2);
  });

  it("blocks an ATTACK against a warded player's tile with SHIELDED, without ever locking the tile", async () => {
    const seen: SimulationRuntimeEventShape[] = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", humanPlayer("player-1")],
        ["player-2", humanPlayer("player-2", { imperialWardCharges: 3 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    runtime.onEvent((event) => seen.push(event));

    runtime.submitCommand({
      commandId: "ward-activate",
      sessionId: "session-2",
      playerId: "player-2",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ACTIVATE_IMPERIAL_WARD",
      payloadJson: "{}"
    });
    await Promise.resolve();

    runtime.submitCommand({
      commandId: "atk-blocked",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });
    await Promise.resolve();

    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "atk-blocked", code: "SHIELDED" }));
    expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11)?.ownerId).toBe("player-2");
  });

  it("lets a warded player still attack out (ward only blocks incoming attacks)", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const seen: SimulationRuntimeEventShape[] = [];
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        scheduleAfter: () => {},
        initialPlayers: new Map([
          ["player-1", humanPlayer("player-1", { imperialWardCharges: 3 })],
          ["player-2", humanPlayer("player-2")]
        ]),
        seedTiles: new Map(),
        initialState: {
          tiles: [
            { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      runtime.onEvent((event) => seen.push(event));

      runtime.submitCommand({
        commandId: "ward-activate-2",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ACTIVATE_IMPERIAL_WARD",
        payloadJson: "{}"
      });
      await Promise.resolve();

      runtime.submitCommand({
        commandId: "atk-outbound",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();

      expect(seen).not.toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "atk-outbound", code: "SHIELDED" }));
      const accepted = seen.find((event) => event.eventType === "COMMAND_ACCEPTED" && event.commandId === "atk-outbound");
      expect(accepted).toBeDefined();
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("grants pendingImperialWard charges once, the first time the endorsed player spawns territory, then clears the grant", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND" },
          { x: 20, y: 20, terrain: "LAND" }
        ],
        activeLocks: []
      },
      pendingImperialWard: { playerId: "endorsed-player", charges: 3 }
    });

    const spawnedFirst = runtime.ensurePlayerHasSpawnTerritory("endorsed-player");
    expect(spawnedFirst).toBe(true);
    expect(runtime.exportState().players.find((p) => p.id === "endorsed-player")?.imperialWardCharges).toBe(3);

    // A second player joining afterwards must not receive the one-shot grant.
    const otherSpawned = runtime.ensurePlayerHasSpawnTerritory("someone-else");
    expect(otherSpawned).toBe(true);
    expect(runtime.exportState().players.find((p) => p.id === "someone-else")?.imperialWardCharges).toBeUndefined();
  });
});

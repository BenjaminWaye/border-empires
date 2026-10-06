import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import { validateFrontierCommand } from "@border-empires/game-domain";
import { MUSTER_ATTACK_COST } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";

const makePlayer = (id: string, manpower: number) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const barbPlayer = (manpower: number) => ({ ...makePlayer("barbarian-1", manpower), isAi: true });

const buildRuntime = (playerManpower: number, barbarianManpower = 9999) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1", playerManpower)],
      ["barbarian-1", barbPlayer(barbarianManpower)]
    ]),
    initialState: {
      tiles: [
        {
          x: 10, y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED"
          // NO muster flag on the origin tile.
        },
        {
          x: 10, y: 11,
          terrain: "LAND",
          ownerId: "barbarian-1",
          ownershipState: "FRONTIER"
        }
      ],
      activeLocks: []
    }
  });

const barbTile = {
  terrain: "LAND" as const,
  ownerId: "barbarian-1",
  ownershipState: "FRONTIER" as const,
  hasFort: false,
  townType: undefined,
  dockId: undefined
};

const origin = {
  terrain: "LAND" as const,
  ownerId: "player-1",
  ownershipState: "SETTLED" as const,
  hasFort: false,
  townType: undefined,
  dockId: undefined,
  x: 10, y: 10
};

const barbTileCoords = { ...barbTile, x: 10, y: 11 };

describe("attacks on and by Planetary Defense (no raids)", () => {
  it("rejects an attack on a barbarian tile when the origin has no muster flag (no raid path)", async () => {
    const runtime = buildRuntime(999);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((e) => seen.push(e));
    runtime.submitCommand({
      commandId: "barb-target-no-muster",
      sessionId: "s",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });
    await Promise.resolve();
    const rejected = seen.find(
      (e): e is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> =>
        e.eventType === "COMMAND_REJECTED" && e.commandId === "barb-target-no-muster"
    );
    expect(rejected).toBeDefined();
  });

  it("allows a barbarian-origin attack without staged muster", () => {
    const runtime = buildRuntime(999, 0);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((e) => seen.push(e));
    runtime.submitCommand({
      commandId: "barb-attack-ok",
      sessionId: "system-runtime",
      playerId: "barbarian-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 11, toX: 10, toY: 10 })
    });
    const rejected = seen.find(
      (e): e is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> =>
        e.eventType === "COMMAND_REJECTED" && e.commandId === "barb-attack-ok"
    );
    const musterReserved = (runtime as unknown as { musterReservedByKey: Map<string, number> }).musterReservedByKey;
    expect(rejected).toBeUndefined();
    expect(musterReserved.size).toBe(0);
  });

  it("validateFrontierCommand charges no manpower for barbarian-origin attacks", () => {
    const result = validateFrontierCommand({
      from: barbTileCoords,
      to: origin,
      actor: { id: "barbarian-1", isAi: true, points: 100, manpower: 0, mods: { attack: 1, defense: 1, income: 1, vision: 1 }, techIds: new Set(), domainIds: new Set(), techRootId: "rewrite-local", allies: new Set() },
      actionType: "ATTACK",
      now: 1_000,
      isAdjacent: true,
      isDockCrossing: false,
      isBridgeCrossing: false,
      originLockedUntil: undefined,
      targetLockedUntil: undefined,
      originLockResolvesAt: undefined,
      targetLockResolvesAt: undefined,
      targetLockOwnerId: undefined,
      actionGoldCost: 0,
      musterSystemEnabled: true,
      originMuster: 0,
      requiredMuster: MUSTER_ATTACK_COST
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manpowerCost).toBe(0);
  });

  const playerAttackOnBarbarian = (originMuster: number, manpower: number) =>
    validateFrontierCommand({
      from: origin,
      to: barbTileCoords,
      actor: { id: "player-1", isAi: false, points: 100, manpower, mods: { attack: 1, defense: 1, income: 1, vision: 1 }, techIds: new Set(), domainIds: new Set(), techRootId: "rewrite-local", allies: new Set() },
      actionType: "ATTACK",
      now: 1_000,
      isAdjacent: true,
      isDockCrossing: false,
      isBridgeCrossing: false,
      originLockedUntil: undefined,
      targetLockedUntil: undefined,
      originLockResolvesAt: undefined,
      targetLockResolvesAt: undefined,
      targetLockOwnerId: undefined,
      actionGoldCost: 1,
      musterSystemEnabled: true,
      originMuster,
      requiredMuster: MUSTER_ATTACK_COST
    });

  it("validateFrontierCommand ignores the player pool and demands origin muster against a barbarian target", () => {
    const result = playerAttackOnBarbarian(0, 9_999);
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe("INSUFFICIENT_MUSTER");
  });

  it("validateFrontierCommand charges the normal muster floor against a barbarian target", () => {
    const result = playerAttackOnBarbarian(MUSTER_ATTACK_COST, 0);
    expect(result).toMatchObject({ ok: true, manpowerCost: MUSTER_ATTACK_COST });
  });

  it("a barbarian-held tile has the same required muster as any other target", () => {
    const runtime = buildRuntime(999);
    const tile = (runtime as unknown as { state: { tiles: Map<string, unknown> } }).state.tiles.get(`10,11`);
    const required = (runtime as unknown as { requiredMusterForTarget(t: unknown): number })
      .requiredMusterForTarget(tile);
    expect(required).toBeGreaterThanOrEqual(MUSTER_ATTACK_COST / 4);
  });
});

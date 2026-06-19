import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import { validateFrontierCommand } from "@border-empires/game-domain";
import { BARBARIAN_RAID_COST, MUSTER_ATTACK_COST } from "@border-empires/shared";
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
          // NO muster flag — raids don't require muster wind-up.
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

describe("Phase 8: barbarian raids", () => {
  it("allows a barbarian raid without a muster flag on the origin tile", () => {
    const runtime = buildRuntime(BARBARIAN_RAID_COST);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((e) => seen.push(e));
    runtime.submitCommand({
      commandId: "raid-ok",
      sessionId: "s",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });
    const rejected = seen.find(
      (e): e is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> =>
        e.eventType === "COMMAND_REJECTED" && e.commandId === "raid-ok"
    );
    expect(rejected).toBeUndefined();
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

  it("validateFrontierCommand rejects barbarian raid when pool < BARBARIAN_RAID_COST", () => {
    const result = validateFrontierCommand({
      from: origin,
      to: barbTileCoords,
      actor: { id: "player-1", isAi: false, points: 100, manpower: BARBARIAN_RAID_COST - 1, mods: { attack: 1, defense: 1, income: 1, vision: 1 }, techIds: new Set(), domainIds: new Set(), techRootId: "rewrite-local", allies: new Set() },
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
      originMuster: 0,
      requiredMuster: BARBARIAN_RAID_COST
    });
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe("INSUFFICIENT_MANPOWER");
  });

  it("validateFrontierCommand allows barbarian raid when pool >= BARBARIAN_RAID_COST", () => {
    const result = validateFrontierCommand({
      from: origin,
      to: barbTileCoords,
      actor: { id: "player-1", isAi: false, points: 100, manpower: BARBARIAN_RAID_COST, mods: { attack: 1, defense: 1, income: 1, vision: 1 }, techIds: new Set(), domainIds: new Set(), techRootId: "rewrite-local", allies: new Set() },
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
      originMuster: 0,
      requiredMuster: BARBARIAN_RAID_COST
    });
    expect(result.ok).toBe(true);
  });

  it("barbarian raid costs BARBARIAN_RAID_COST from pool, not MUSTER_ATTACK_COST", () => {
    expect(BARBARIAN_RAID_COST).toBeLessThan(MUSTER_ATTACK_COST);
    const runtime = buildRuntime(999);
    const tile = (runtime as unknown as { tiles: Map<string, unknown> }).tiles.get(`10,11`);
    const required = (runtime as unknown as { requiredMusterForTarget(t: unknown): number })
      .requiredMusterForTarget(tile);
    expect(required).toBe(BARBARIAN_RAID_COST);
  });
});

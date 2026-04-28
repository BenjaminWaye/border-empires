import { afterEach, describe, expect, it, vi } from "vitest";

import type { Player, Tile, TileKey } from "@border-empires/shared";

import { createServerFrontierActionRuntime } from "./server-frontier-action-runtime.js";

const buildPlayer = (id: string): Player =>
  ({
    id,
    name: id,
    color: "#fff",
    level: 1,
    points: 1_000,
    gold: 1_000,
    stamina: 100,
    manpower: 100,
    manpowerCap: 100,
    manpowerRegenPerMinute: 0,
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    territoryTiles: new Set<TileKey>(),
    allies: new Set<string>(),
    missionStats: { neutralCaptures: 0, enemyCaptures: 0, combatWins: 0 },
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    revealTargets: new Set<string>(),
    availableTechPicks: 0,
    activity: [],
    isAi: false,
    spawnShieldUntil: 0,
    lastActiveAt: 0
  }) as unknown as Player;

describe("server-frontier-action-runtime", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("transfers the origin tile on a failed attack even when the defender player record is missing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    vi
      .spyOn(Math, "random")
      .mockImplementationOnce(() => 0.5)
      .mockImplementationOnce(() => 0.5)
      .mockImplementation(() => 0.999);

    const actor = buildPlayer("attacker");
    const origin: Tile = { x: 4, y: 4, terrain: "LAND", ownerId: "attacker", ownershipState: "FRONTIER", lastChangedAt: 0 };
    const target: Tile = { x: 5, y: 4, terrain: "LAND", ownerId: "missing-defender", ownershipState: "FRONTIER", lastChangedAt: 0 };
    const tiles = new Map<string, Tile>([
      ["4,4", origin],
      ["5,4", target]
    ]);
    const updateOwnership = vi.fn((x: number, y: number, ownerId?: string, ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN") => {
      const tile = tiles.get(`${x},${y}`);
      if (!tile) return;
      if (ownerId === undefined) delete tile.ownerId;
      else tile.ownerId = ownerId;
      if (ownershipState === undefined) delete tile.ownershipState;
      else tile.ownershipState = ownershipState;
    });
    const sendToPlayer = vi.fn();

    const runtime = createServerFrontierActionRuntime({
      FRONTIER_ACTION_GOLD_COST: 10,
      BREACH_SHOCK_DEF_MULT: 1,
      PVP_REWARD_MULT: 1,
      BARBARIAN_OWNER_ID: "barbarian",
      players: new Map([[actor.id, actor]]),
      docksByTile: new Map(),
      breachShockByTile: new Map(),
      pendingSettlementsByTile: new Map(),
      combatLocks: new Map(),
      barbarianAgents: new Map(),
      barbarianAgentByTileKey: new Map(),
      repeatFights: new Map(),
      telemetryCounters: { frontierClaims: 0 },
      socketsByPlayer: new Map(),
      now: () => Date.now(),
      key: (x: number, y: number) => `${x},${y}`,
      parseKey: (tileKey: TileKey) => {
        const [xText, yText] = tileKey.split(",");
        const x = Number(xText);
        const y = Number(yText);
        return [x, y];
      },
      playerTile: (x: number, y: number) => {
        const tile = tiles.get(`${x},${y}`);
        if (!tile) throw new Error(`Missing tile ${x},${y}`);
        return tile;
      },
      recalcPlayerDerived: vi.fn(),
      updateOwnership,
      applyStaminaRegen: vi.fn(),
      applyManpowerRegen: vi.fn(),
      hasEnoughManpower: () => true,
      manpowerMinForAction: () => 1,
      manpowerCostForAction: () => 10,
      isAdjacentTile: () => true,
      validDockCrossingTarget: () => false,
      findOwnedDockOriginForCrossing: () => undefined,
      crossingBlockedByAetherWall: () => false,
      markAiDefensePriority: vi.fn(),
      frontierClaimDurationMsAt: () => 1_000,
      outpostAttackMultAt: () => 1,
      activeAttackBuffMult: () => 1,
      attackMultiplierForTarget: () => 0,
      playerDefensiveness: () => 1,
      fortDefenseMultAt: () => 1,
      settledDefenseMultiplierForTarget: () => 1,
      settlementDefenseMultAt: () => 1,
      ownershipDefenseMultiplierForTarget: () => 1,
      frontierDefenseAddForTarget: () => 100,
      originTileHeldByActiveFort: () => false,
      resolveFailedBarbarianDefenseOutcome: () => ({ resultChanges: [], defenderTile: { x: 4, y: 4 } }),
      applyFailedAttackTerritoryOutcome: (_actorId, defenderOwnerId, _defenderIsBarbarian, from, _to, _originTileKey, _targetTileKey) => {
        if (!defenderOwnerId) throw new Error("Expected defender owner id");
        updateOwnership(from.x, from.y, defenderOwnerId, "FRONTIER");
        return { originLost: true, resultChanges: [{ x: from.x, y: from.y, ownerId: defenderOwnerId, ownershipState: "FRONTIER" as const }] };
      },
      settleAttackManpower: () => 5,
      applyTownWarShock: vi.fn(),
      settledTileCountForPlayer: () => 1,
      seizeStoredYieldOnCapture: vi.fn(),
      pillageSettledTile: () => ({ gold: 0, share: 0, strategic: {} }),
      incrementVendettaCount: vi.fn(),
      maybeIssueVendettaMission: vi.fn(),
      maybeIssueResourceMission: vi.fn(),
      updateMissionState: vi.fn(),
      resolveEliminationIfNeeded: vi.fn(),
      sendPlayerUpdate: vi.fn(),
      sendLocalVisionDeltaForPlayer: vi.fn(),
      sendToPlayer,
      sendPostCombatFollowUps: vi.fn(),
      claimFirstSpecialSiteCaptureBonus: () => 0,
      pairKeyFor: (a, b) => `${a}:${b}`,
      pruneRepeatFightEntries: () => [],
      getBarbarianProgressGain: () => 0,
      upsertBarbarianAgent: vi.fn(),
      logBarbarianEvent: vi.fn(),
      baseTileValue: () => 1
    });

    const result = runtime.tryQueueBasicFrontierAction(actor, "ATTACK", 4, 4, 5, 4);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.predictedResult).toEqual(
      expect.objectContaining({
        attackerWon: false,
        defenderOwnerId: "missing-defender",
        changes: [{ x: 4, y: 4, ownerId: "missing-defender", ownershipState: "FRONTIER" }]
      })
    );

    vi.advanceTimersByTime(3_000);

    expect(updateOwnership).toHaveBeenCalledWith(4, 4, "missing-defender", "FRONTIER");
    expect(sendToPlayer).toHaveBeenCalledWith(
      "attacker",
      expect.objectContaining({
        type: "COMBAT_RESULT",
        attackerWon: false,
        winnerId: "missing-defender",
        defenderOwnerId: "missing-defender",
        changes: [{ x: 4, y: 4, ownerId: "missing-defender", ownershipState: "FRONTIER" }]
      })
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Dock, Player, Tile, TileKey } from "@border-empires/shared";

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
      dockCrossingDestinationForTarget: () => undefined,
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
      getOrInitStrategicStocks: () => ({ FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }),
      strategicResourceKeys: ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"],
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
    expect(result.result).toEqual(
      expect.objectContaining({
        attackerWon: false,
        defenderOwnerId: "missing-defender",
        changes: [{ x: 4, y: 4, ownerId: "missing-defender", ownershipState: "FRONTIER" }],
        pointsDelta: expect.any(Number),
        manpowerDelta: expect.any(Number),
        pillagedGold: 0,
        pillagedStrategic: {}
      })
    );

    vi.advanceTimersByTime(3_000);

    expect(updateOwnership).toHaveBeenCalledWith(4, 4, "missing-defender", "FRONTIER");
    expect(sendToPlayer).not.toHaveBeenCalled();
  });

  it("treats an attack request against authoritative neutral land as a manpower-free expand", () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);

    const actor = buildPlayer("attacker");
    actor.manpower = 0;
    const origin: Tile = { x: 4, y: 4, terrain: "LAND", ownerId: "attacker", ownershipState: "FRONTIER", lastChangedAt: 0 };
    const target: Tile = { x: 5, y: 4, terrain: "LAND", ownershipState: "FRONTIER", lastChangedAt: 0 };
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
    const hasEnoughManpower = vi.fn((_player: Player, amount: number) => amount === 0);

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
      hasEnoughManpower,
      manpowerMinForAction: (actionType) => (actionType === "ATTACK" ? 60 : 0),
      manpowerCostForAction: (actionType) => (actionType === "ATTACK" ? 25 : 0),
      isAdjacentTile: () => true,
      dockCrossingDestinationForTarget: () => undefined,
      validDockCrossingTarget: () => false,
      findOwnedDockOriginForCrossing: () => undefined,
      crossingBlockedByAetherWall: () => false,
      markAiDefensePriority: vi.fn(),
      frontierClaimDurationMsAt: () => 1_000,
      outpostAttackMultAt: () => 1,
      activeAttackBuffMult: () => 1,
      attackMultiplierForTarget: () => 1,
      playerDefensiveness: () => 1,
      fortDefenseMultAt: () => 1,
      settledDefenseMultiplierForTarget: () => 1,
      settlementDefenseMultAt: () => 1,
      ownershipDefenseMultiplierForTarget: () => 1,
      frontierDefenseAddForTarget: () => 0,
      originTileHeldByActiveFort: () => false,
      resolveFailedBarbarianDefenseOutcome: () => ({ resultChanges: [], defenderTile: { x: 4, y: 4 } }),
      applyFailedAttackTerritoryOutcome: () => ({ originLost: false, resultChanges: [] }),
      settleAttackManpower: vi.fn(),
      applyTownWarShock: vi.fn(),
      settledTileCountForPlayer: () => 1,
      getOrInitStrategicStocks: () => ({ FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }),
      strategicResourceKeys: ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"],
      seizeStoredYieldOnCapture: vi.fn(),
      pillageSettledTile: () => ({ gold: 0, share: 0, strategic: {} }),
      incrementVendettaCount: vi.fn(),
      maybeIssueVendettaMission: vi.fn(),
      maybeIssueResourceMission: vi.fn(),
      updateMissionState: vi.fn(),
      resolveEliminationIfNeeded: vi.fn(),
      sendPlayerUpdate: vi.fn(),
      sendLocalVisionDeltaForPlayer: vi.fn(),
      sendToPlayer: vi.fn(),
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

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        actionType: "EXPAND"
      })
    );
    expect(hasEnoughManpower).toHaveBeenCalledWith(actor, 0);

    vi.advanceTimersByTime(1_000);

    expect(updateOwnership).toHaveBeenCalledWith(5, 4, "attacker", "FRONTIER");
  });

  it("tracks dock crossing cooldown per linked destination instead of locking the whole origin dock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);

    const actor = buildPlayer("attacker");
    const origin: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: actor.id, ownershipState: "FRONTIER", dockId: "dock-a", lastChangedAt: 0 };
    const targetA: Tile = { x: 20, y: 20, terrain: "LAND", lastChangedAt: 0 };
    const targetB: Tile = { x: 30, y: 30, terrain: "LAND", lastChangedAt: 0 };
    const targetC: Tile = { x: 40, y: 40, terrain: "LAND", lastChangedAt: 0 };
    const dockA: Dock = { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b", "dock-c", "dock-d"], cooldownUntil: 0 };
    const dockB: Dock = { dockId: "dock-b", tileKey: "20,20", pairedDockId: "dock-a", connectedDockIds: ["dock-a"], cooldownUntil: 0 };
    const dockC: Dock = { dockId: "dock-c", tileKey: "30,30", pairedDockId: "dock-a", connectedDockIds: ["dock-a"], cooldownUntil: 0 };
    const dockD: Dock = { dockId: "dock-d", tileKey: "40,40", pairedDockId: "dock-a", connectedDockIds: ["dock-a"], cooldownUntil: 0 };
    const tiles = new Map<string, Tile>([
      ["10,10", origin],
      ["20,20", targetA],
      ["30,30", targetB],
      ["40,40", targetC]
    ]);
    const docksByTile = new Map<TileKey, Dock>([
      ["10,10", dockA],
      ["20,20", dockB],
      ["30,30", dockC],
      ["40,40", dockD]
    ]);
    const updateOwnership = vi.fn((x: number, y: number, ownerId?: string, ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN") => {
      const tile = tiles.get(`${x},${y}`);
      if (!tile) return;
      if (ownerId === undefined) delete tile.ownerId;
      else tile.ownerId = ownerId;
      if (ownershipState === undefined) delete tile.ownershipState;
      else tile.ownershipState = ownershipState;
    });
    const dockDestinations = new Map<string, Dock>([
      ["20,20", dockB],
      ["30,30", dockC],
      ["40,40", dockD]
    ]);

    const runtime = createServerFrontierActionRuntime({
      FRONTIER_ACTION_GOLD_COST: 10,
      BREACH_SHOCK_DEF_MULT: 1,
      PVP_REWARD_MULT: 1,
      BARBARIAN_OWNER_ID: "barbarian",
      players: new Map([[actor.id, actor]]),
      docksByTile,
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
        return [Number(xText), Number(yText)];
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
      manpowerMinForAction: () => 0,
      manpowerCostForAction: () => 0,
      isAdjacentTile: (fromX, fromY, toX, toY) => fromX === toX && fromY === toY,
      dockCrossingDestinationForTarget: (_dock, x, y) => dockDestinations.get(`${x},${y}`),
      validDockCrossingTarget: (_dock, x, y) => dockDestinations.has(`${x},${y}`),
      findOwnedDockOriginForCrossing: () => undefined,
      crossingBlockedByAetherWall: () => false,
      markAiDefensePriority: vi.fn(),
      frontierClaimDurationMsAt: () => 1_000,
      outpostAttackMultAt: () => 1,
      activeAttackBuffMult: () => 1,
      attackMultiplierForTarget: () => 1,
      playerDefensiveness: () => 1,
      fortDefenseMultAt: () => 1,
      settledDefenseMultiplierForTarget: () => 1,
      settlementDefenseMultAt: () => 1,
      ownershipDefenseMultiplierForTarget: () => 1,
      frontierDefenseAddForTarget: () => 0,
      originTileHeldByActiveFort: () => false,
      resolveFailedBarbarianDefenseOutcome: () => ({ resultChanges: [], defenderTile: { x: 10, y: 10 } }),
      applyFailedAttackTerritoryOutcome: () => ({ originLost: false, resultChanges: [] }),
      settleAttackManpower: vi.fn(),
      applyTownWarShock: vi.fn(),
      settledTileCountForPlayer: () => 1,
      getOrInitStrategicStocks: () => ({ FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }),
      strategicResourceKeys: ["FOOD", "IRON", "CRYSTAL", "SUPPLY", "SHARD", "OIL"],
      seizeStoredYieldOnCapture: vi.fn(),
      pillageSettledTile: () => ({ gold: 0, share: 0, strategic: {} }),
      incrementVendettaCount: vi.fn(),
      maybeIssueVendettaMission: vi.fn(),
      maybeIssueResourceMission: vi.fn(),
      updateMissionState: vi.fn(),
      resolveEliminationIfNeeded: vi.fn(),
      sendPlayerUpdate: vi.fn(),
      sendLocalVisionDeltaForPlayer: vi.fn(),
      sendToPlayer: vi.fn(),
      sendPostCombatFollowUps: vi.fn(),
      claimFirstSpecialSiteCaptureBonus: () => 0,
      pairKeyFor: (a, b) => `${a}:${b}`,
      pruneRepeatFightEntries: () => [],
      getBarbarianProgressGain: () => 0,
      upsertBarbarianAgent: vi.fn(),
      logBarbarianEvent: vi.fn(),
      baseTileValue: () => 1
    });

    const firstCrossing = runtime.tryQueueBasicFrontierAction(actor, "EXPAND", 10, 10, 20, 20);
    expect(firstCrossing.ok).toBe(true);

    vi.advanceTimersByTime(1_100);
    delete targetA.ownerId;
    delete targetA.ownershipState;

    const sameRouteRetry = runtime.tryQueueBasicFrontierAction(actor, "EXPAND", 10, 10, 20, 20);
    expect(sameRouteRetry).toEqual(expect.objectContaining({ ok: false, code: "DOCK_COOLDOWN" }));

    const differentRoute = runtime.tryQueueBasicFrontierAction(actor, "EXPAND", 10, 10, 30, 30);
    expect(differentRoute.ok).toBe(true);
    expect(dockA.routeCooldownUntilByDockId).toEqual(expect.objectContaining({ "dock-b": expect.any(Number) }));
  });
});

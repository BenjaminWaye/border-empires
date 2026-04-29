import {
  BARBARIAN_ACTION_INTERVAL_MS,
  BARBARIAN_CLEAR_GOLD_REWARD,
  BARBARIAN_DEFENSE_POWER,
  COMBAT_LOCK_MS,
  DOCK_CROSSING_COOLDOWN_MS,
  DOCK_DEFENSE_MULT,
  PVP_REPEAT_FLOOR,
  PVP_REPEAT_WINDOW_MS,
  combatWinChance,
  pvpPointsReward,
  randomFactor,
  ratingFromPointsLevel,
  type BarbarianAgent,
  type Dock,
  type OwnershipState,
  type Player,
  type ResourceType,
  type Tile,
  type TileKey
} from "@border-empires/shared";
import type { StrategicResource } from "./server-shared-types.js";
import type { Ws } from "./server-runtime-config.js";
import type {
  BasicFrontierActionType,
  CombatResultChange,
  PendingCapture,
  PrecomputedFrontierCombat
} from "./server-frontier-action-types.js";

type TryQueueSuccess = {
  ok: true;
  actionType: BasicFrontierActionType;
  resolvesAt: number;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  predictedResult?: {
    attackType: BasicFrontierActionType;
    attackerWon: boolean;
    winnerId?: string;
    defenderOwnerId?: string;
    origin: { x: number; y: number };
    target: { x: number; y: number };
    changes: CombatResultChange[];
    pointsDelta: number;
    manpowerDelta: number;
    pillagedGold: number;
    pillagedShare: number;
    pillagedStrategic: Partial<Record<StrategicResource, number>>;
    atkEff: number;
    defEff: number;
    winChance: number;
    levelDelta: number;
  };
  attackAlert?: {
    defenderId: string;
    attackerId: string;
    attackerName: string;
    x: number;
    y: number;
    fromX: number;
    fromY: number;
    resolvesAt: number;
  };
};

type TryQueueFailure = { ok: false; code: string; message: string; cooldownRemainingMs?: number };

export interface CreateServerFrontierActionRuntimeDeps {
  FRONTIER_ACTION_GOLD_COST: number;
  BREACH_SHOCK_DEF_MULT: number;
  PVP_REWARD_MULT: number;
  BARBARIAN_OWNER_ID: string;
  players: Map<string, Player>;
  docksByTile: Map<TileKey, Dock>;
  breachShockByTile: Map<TileKey, { ownerId: string; expiresAt: number }>;
  pendingSettlementsByTile: Map<TileKey, { ownerId: string }>;
  combatLocks: Map<TileKey, PendingCapture>;
  barbarianAgents: Map<string, BarbarianAgent>;
  barbarianAgentByTileKey: Map<TileKey, string>;
  repeatFights: Map<string, number[]>;
  telemetryCounters: { frontierClaims: number };
  socketsByPlayer: Map<string, Ws>;
  now: () => number;
  key: (x: number, y: number) => TileKey;
  parseKey: (tileKey: TileKey) => [number, number];
  playerTile: (x: number, y: number) => Tile;
  recalcPlayerDerived: (player: Player) => void;
  updateOwnership: (x: number, y: number, ownerId?: string, ownershipState?: OwnershipState) => void;
  applyStaminaRegen: (player: Player) => void;
  applyManpowerRegen: (player: Player) => void;
  hasEnoughManpower: (player: Player, amount: number) => boolean;
  manpowerMinForAction: (actionType: BasicFrontierActionType) => number;
  manpowerCostForAction: (actionType: BasicFrontierActionType) => number;
  isAdjacentTile: (fromX: number, fromY: number, toX: number, toY: number) => boolean;
  validDockCrossingTarget: (dock: Dock, x: number, y: number, allowAdjacentToDock?: boolean) => boolean;
  findOwnedDockOriginForCrossing: (actor: Player, targetX: number, targetY: number, allowAdjacentToDock?: boolean) => Tile | undefined;
  crossingBlockedByAetherWall: (fromX: number, fromY: number, toX: number, toY: number) => boolean;
  markAiDefensePriority: (playerId: string) => void;
  frontierClaimDurationMsAt: (x: number, y: number) => number;
  outpostAttackMultAt: (attackerId: string, tileKey: TileKey) => number;
  activeAttackBuffMult: (playerId: string) => number;
  attackMultiplierForTarget: (attackerId: string, target: Tile, originTileKey?: TileKey) => number;
  playerDefensiveness: (player: Player) => number;
  fortDefenseMultAt: (defenderId: string, tileKey: TileKey) => number;
  settledDefenseMultiplierForTarget: (defenderId: string, target: Tile) => number;
  settlementDefenseMultAt: (defenderId: string, tileKey: TileKey) => number;
  ownershipDefenseMultiplierForTarget: (defenderId: string | undefined, target: Tile) => number;
  frontierDefenseAddForTarget: (defenderId: string, target: Tile) => number;
  originTileHeldByActiveFort: (actorId: string, tileKey: TileKey) => boolean;
  resolveFailedBarbarianDefenseOutcome: (input: {
    fortHeldOrigin: boolean;
    origin: { x: number; y: number };
    target: { x: number; y: number };
  }) => { resultChanges: CombatResultChange[]; defenderTile: { x: number; y: number } };
  applyFailedAttackTerritoryOutcome: (
    actorId: string,
    defenderOwnerId: string | undefined,
    defenderIsBarbarian: boolean,
    from: Tile,
    to: Tile,
    originTileKey: TileKey,
    targetTileKey: TileKey
  ) => { resultChanges: CombatResultChange[]; originLost: boolean };
  settleAttackManpower: (player: Player, committedManpower: number, attackerWon: boolean, atkEff: number, defEff: number) => number;
  applyTownWarShock: (tileKey: TileKey) => void;
  settledTileCountForPlayer: (player: Player) => number;
  getOrInitStrategicStocks: (playerId: string) => Record<StrategicResource, number>;
  strategicResourceKeys: readonly StrategicResource[];
  seizeStoredYieldOnCapture: (attacker: Player, tileKey: TileKey) => unknown;
  pillageSettledTile: (
    attacker: Player,
    defender: Player,
    defenderTileCountBeforeCapture: number
  ) => { gold: number; share: number; strategic: Partial<Record<StrategicResource, number>> };
  incrementVendettaCount: (attackerId: string, targetId: string) => void;
  maybeIssueVendettaMission: (player: Player, otherPlayerId: string) => void;
  maybeIssueResourceMission: (player: Player, resource: ResourceType | undefined) => void;
  updateMissionState: (player: Player) => void;
  resolveEliminationIfNeeded: (player: Player, isOnline: boolean) => void;
  sendPlayerUpdate: (player: Player, incomeDelta: number) => void;
  sendLocalVisionDeltaForPlayer: (playerId: string, changedCenters: Array<{ x: number; y: number }>) => void;
  sendToPlayer: (
    playerId: string,
    payload: {
      type: "COMBAT_RESULT";
      attackType: BasicFrontierActionType;
      attackerWon: boolean;
      winnerId?: string;
      defenderOwnerId?: string;
      origin: { x: number; y: number };
      target: { x: number; y: number };
      atkEff: number;
      defEff: number;
      winChance: number;
      changes: CombatResultChange[];
      pointsDelta: number;
      manpowerDelta: number;
      pillagedGold: number;
      pillagedShare: number;
      pillagedStrategic: Partial<Record<StrategicResource, number>>;
    }
  ) => void;
  sendPostCombatFollowUps: (actorId: string, changedCenters: Array<{ x: number; y: number }>, defenderId?: string) => void;
  claimFirstSpecialSiteCaptureBonus: (player: Player, x: number, y: number) => number;
  pairKeyFor: (a: string, b: string) => string;
  pruneRepeatFightEntries: (pairKey: string, nowMs: number) => number[];
  getBarbarianProgressGain: (from: Tile) => number;
  upsertBarbarianAgent: (agent: BarbarianAgent) => void;
  logBarbarianEvent: (message: string) => void;
  baseTileValue: (resource: ResourceType | undefined) => number;
}

export interface ServerFrontierActionRuntime {
  hasPendingSettlementForPlayer: (playerId: string) => boolean;
  pendingSettlementCountForPlayer: (playerId: string) => number;
  tileHasPendingSettlement: (tileKey: TileKey) => boolean;
  tryQueueBasicFrontierAction: (
    actor: Player,
    actionType: BasicFrontierActionType,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ) => TryQueueSuccess | TryQueueFailure;
}

export const createServerFrontierActionRuntime = (
  deps: CreateServerFrontierActionRuntimeDeps
): ServerFrontierActionRuntime => {
  const hasPendingSettlementForPlayer = (playerId: string): boolean => {
    for (const pending of deps.pendingSettlementsByTile.values()) {
      if (pending.ownerId === playerId) return true;
    }
    return false;
  };

  const pendingSettlementCountForPlayer = (playerId: string): number => {
    let count = 0;
    for (const pending of deps.pendingSettlementsByTile.values()) {
      if (pending.ownerId === playerId) count += 1;
    }
    return count;
  };

  const tileHasPendingSettlement = (tileKey: TileKey): boolean => deps.pendingSettlementsByTile.has(tileKey);

  const tryQueueBasicFrontierAction = (
    actor: Player,
    actionType: BasicFrontierActionType,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ): TryQueueSuccess | TryQueueFailure => {
    deps.applyStaminaRegen(actor);
    actor.lastActiveAt = deps.now();
    let from = deps.playerTile(fromX, fromY);
    const to = deps.playerTile(toX, toY);
    const targetIsNeutral = !to.ownerId;
    const effectiveActionType: BasicFrontierActionType = targetIsNeutral ? "EXPAND" : actionType;
    if (actionType === "EXPAND" && !targetIsNeutral) return { ok: false, code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" };
    if (actionType === "ATTACK" && to.ownerId === actor.id) return { ok: false, code: "ATTACK_TARGET_INVALID", message: "target must be enemy-controlled land" };
    let fk = deps.key(from.x, from.y);
    const tk = deps.key(to.x, to.y);
    let fromDock = deps.docksByTile.get(fk);
    let adjacent = deps.isAdjacentTile(from.x, from.y, to.x, to.y);
    const allowAdjacentToDock = effectiveActionType !== "EXPAND";
    let dockCrossing = Boolean(fromDock && deps.validDockCrossingTarget(fromDock, to.x, to.y, allowAdjacentToDock));
    if (!adjacent && !dockCrossing && effectiveActionType === "ATTACK") {
      const altFrom = deps.findOwnedDockOriginForCrossing(actor, to.x, to.y, allowAdjacentToDock);
      if (altFrom) {
        from = altFrom;
        fk = deps.key(from.x, from.y);
        fromDock = deps.docksByTile.get(fk);
        adjacent = deps.isAdjacentTile(from.x, from.y, to.x, to.y);
        dockCrossing = Boolean(fromDock && deps.validDockCrossingTarget(fromDock, to.x, to.y, allowAdjacentToDock));
      }
    }
    if (!adjacent && !dockCrossing) return { ok: false, code: "NOT_ADJACENT", message: "target must be adjacent or valid dock crossing" };
    if (adjacent && !dockCrossing && deps.crossingBlockedByAetherWall(from.x, from.y, to.x, to.y)) return { ok: false, code: "AETHER_WALL_BLOCKED", message: "crossing blocked by aether wall" };
    if (dockCrossing && fromDock && fromDock.cooldownUntil > deps.now()) return { ok: false, code: "DOCK_COOLDOWN", message: "dock crossing endpoint on cooldown" };
    if (from.ownerId !== actor.id) return { ok: false, code: "NOT_OWNER", message: "origin not owned" };
    if (to.terrain !== "LAND") return { ok: false, code: "BARRIER", message: "target is barrier" };
    if (deps.combatLocks.has(fk)) return { ok: false, code: "ATTACK_COOLDOWN", message: "origin tile is still on attack cooldown", cooldownRemainingMs: Math.max(0, (deps.combatLocks.get(fk)?.resolvesAt ?? deps.now()) - deps.now()) };
    if (deps.combatLocks.has(tk)) return { ok: false, code: "LOCKED", message: "tile locked in combat" };
    if (actor.points < deps.FRONTIER_ACTION_GOLD_COST) return { ok: false, code: "INSUFFICIENT_GOLD", message: effectiveActionType === "ATTACK" ? "insufficient gold for attack" : "insufficient gold for frontier claim" };
    deps.applyManpowerRegen(actor);
    const manpowerMin = deps.manpowerMinForAction(effectiveActionType);
    const manpowerCost = deps.manpowerCostForAction(effectiveActionType);
    if (!deps.hasEnoughManpower(actor, manpowerMin)) return { ok: false, code: "INSUFFICIENT_MANPOWER", message: `need ${manpowerMin.toFixed(0)} manpower to launch attack` };
    const defenderIsBarbarian = to.ownerId === deps.BARBARIAN_OWNER_ID;
    const defenderOwnerId = to.ownerId && !defenderIsBarbarian ? to.ownerId : undefined;
    const defender = defenderOwnerId ? deps.players.get(defenderOwnerId) : undefined;
    if (defender && actor.allies.has(defender.id)) return { ok: false, code: "ALLY_TARGET", message: "cannot attack allied tile" };
    if (defender && defender.spawnShieldUntil > deps.now()) return { ok: false, code: "SHIELDED", message: "target shielded" };
    if (!actor.isAi && defender?.isAi) deps.markAiDefensePriority(defender.id);

    let precomputedCombat: PrecomputedFrontierCombat | undefined;
    if (defenderOwnerId || defenderIsBarbarian) {
      const atkEff = 10 * actor.mods.attack * deps.activeAttackBuffMult(actor.id) * deps.attackMultiplierForTarget(actor.id, to, fk) * deps.outpostAttackMultAt(actor.id, fk) * randomFactor();
      const shock = deps.breachShockByTile.get(tk);
      const shockMult = defenderOwnerId && shock && shock.ownerId === defenderOwnerId && shock.expiresAt > deps.now() ? deps.BREACH_SHOCK_DEF_MULT : 1;
      const defEff = defenderIsBarbarian
        ? 10 * BARBARIAN_DEFENSE_POWER * DOCK_DEFENSE_MULT * randomFactor()
        : (
            10 *
            (defender?.mods.defense ?? 1) *
            (defender ? deps.playerDefensiveness(defender) : 1) *
            shockMult *
            deps.fortDefenseMultAt(defenderOwnerId!, tk) *
            (deps.docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1) *
            deps.settledDefenseMultiplierForTarget(defenderOwnerId!, to) *
            deps.settlementDefenseMultAt(defenderOwnerId!, tk) *
            deps.ownershipDefenseMultiplierForTarget(defenderOwnerId, to) +
            deps.frontierDefenseAddForTarget(defenderOwnerId!, to)
          ) * randomFactor();
      const winChance = combatWinChance(atkEff, defEff);
      const attackerWon = Math.random() < winChance;
      const fortHeldOrigin = deps.originTileHeldByActiveFort(actor.id, fk);
      const changes = attackerWon
        ? [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" as const }]
        : defenderIsBarbarian
          ? deps.resolveFailedBarbarianDefenseOutcome({ fortHeldOrigin, origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y } }).resultChanges
          : defenderOwnerId
            ? fortHeldOrigin ? [] : [{ x: from.x, y: from.y, ownerId: defenderOwnerId, ownershipState: "FRONTIER" as const }]
            : [];
      const winnerId = attackerWon ? actor.id : defenderIsBarbarian ? deps.BARBARIAN_OWNER_ID : defenderOwnerId;
      const manpowerDelta = -(attackerWon ? Math.max(10, manpowerCost * 0.16) : manpowerCost * Math.min(1.25, 0.6 + (defEff / Math.max(1, atkEff)) * 0.35));
      const targetWasSettled = to.ownershipState === "SETTLED";
      const defenderTileCountBeforeCapture = defender ? Math.max(1, deps.settledTileCountForPlayer(defender)) : 0;
      const pillagedShare = attackerWon && defender && targetWasSettled ? 1 / defenderTileCountBeforeCapture : 0;
      const pillagedGold = attackerWon && defender && targetWasSettled ? Math.max(0, defender.points * pillagedShare) : 0;
      const defenderStrategicStocks = defender ? deps.getOrInitStrategicStocks(defender.id) : undefined;
      const pillagedStrategic = attackerWon && defender && targetWasSettled && defenderStrategicStocks
        ? Object.fromEntries(
            deps.strategicResourceKeys
              .map((resource: StrategicResource) => [resource, Math.max(0, defenderStrategicStocks[resource] ?? 0) * pillagedShare] as const)
              .filter((entry: readonly [StrategicResource, number]) => entry[1] > 0)
          ) as Partial<Record<StrategicResource, number>>
        : {};
      const pointsDelta = (() => {
        if (attackerWon && defenderIsBarbarian) return BARBARIAN_CLEAR_GOLD_REWARD;
        if (attackerWon && defender) {
          const pairKey = deps.pairKeyFor(actor.id, defender.id);
          const repeatEntries = deps.pruneRepeatFightEntries(pairKey, deps.now());
          const repeatMult = Math.max(PVP_REPEAT_FLOOR, 0.5 ** repeatEntries.length);
          return actor.allies.has(defender.id)
            ? 0
            : pvpPointsReward(
                deps.baseTileValue(to.resource),
                ratingFromPointsLevel(actor.points - deps.FRONTIER_ACTION_GOLD_COST + pillagedGold, actor.level),
                ratingFromPointsLevel(defender.points - pillagedGold, defender.level)
              ) * repeatMult * deps.PVP_REWARD_MULT;
        }
        if (!attackerWon && defender) {
          return actor.allies.has(defender.id)
            ? 0
            : pvpPointsReward(
                deps.baseTileValue(from.resource),
                ratingFromPointsLevel(defender.points, defender.level),
                ratingFromPointsLevel(actor.points - deps.FRONTIER_ACTION_GOLD_COST, actor.level)
              ) * deps.PVP_REWARD_MULT;
        }
        return 0;
      })();
      precomputedCombat = {
        atkEff,
        defEff,
        winChance,
        attackerWon,
        changes,
        ...(winnerId !== undefined ? { winnerId } : {}),
        ...(defenderIsBarbarian ? { defenderOwnerId: deps.BARBARIAN_OWNER_ID } : defenderOwnerId ? { defenderOwnerId } : {}),
        pointsDelta,
        manpowerDelta,
        pillagedGold,
        pillagedShare,
        pillagedStrategic
      };
    }

    const resolvesAt = deps.now() + (effectiveActionType === "EXPAND" ? deps.frontierClaimDurationMsAt(to.x, to.y) : COMBAT_LOCK_MS);
    const pending: PendingCapture = {
      resolvesAt,
      origin: fk,
      target: tk,
      attackerId: actor.id,
      staminaCost: 0,
      manpowerCost,
      actionType: effectiveActionType,
      cancelled: false,
      ...(precomputedCombat ? { precomputedCombat } : {})
    };
    deps.combatLocks.set(fk, pending);
    deps.combatLocks.set(tk, pending);
    pending.timeout = setTimeout(() => {
      if (pending.cancelled) return;
      deps.combatLocks.delete(fk);
      deps.combatLocks.delete(tk);
      if (dockCrossing && fromDock) fromDock.cooldownUntil = deps.now() + DOCK_CROSSING_COOLDOWN_MS;
      if (!defenderOwnerId && !defenderIsBarbarian) {
        actor.points -= deps.FRONTIER_ACTION_GOLD_COST;
        deps.recalcPlayerDerived(actor);
        actor.stamina -= pending.staminaCost;
        deps.updateOwnership(to.x, to.y, actor.id, "FRONTIER");
        deps.claimFirstSpecialSiteCaptureBonus(actor, to.x, to.y);
        deps.telemetryCounters.frontierClaims += 1;
        actor.missionStats.neutralCaptures += 1;
        deps.maybeIssueResourceMission(actor, to.resource);
        deps.updateMissionState(actor);
        deps.sendPlayerUpdate(actor, 0);
        deps.sendLocalVisionDeltaForPlayer(actor.id, [{ x: to.x, y: to.y }]);
        return;
      }
      actor.points -= deps.FRONTIER_ACTION_GOLD_COST;
      actor.stamina -= pending.staminaCost;
      const lockedCombat = pending.precomputedCombat;
      const atkEff = lockedCombat?.atkEff ?? 10;
      const defEff = lockedCombat?.defEff ?? 10;
      const winChance = lockedCombat?.winChance ?? 0.5;
      const win = lockedCombat?.attackerWon ?? false;
      const manpowerDelta = lockedCombat?.manpowerDelta ?? 0;
      deps.applyTownWarShock(tk);
      let pillagedGold = lockedCombat?.pillagedGold ?? 0;
      let pillagedShare = lockedCombat?.pillagedShare ?? 0;
      let pillagedStrategic: Partial<Record<StrategicResource, number>> = lockedCombat?.pillagedStrategic ?? {};
      let resultChanges: CombatResultChange[] = lockedCombat?.changes ?? [];
      const pointsDelta = lockedCombat?.pointsDelta ?? 0;
      if (win) {
        const targetWasSettled = to.ownershipState === "SETTLED";
        const defenderTileCountBeforeCapture = defender ? Math.max(1, deps.settledTileCountForPlayer(defender)) : 0;
        deps.updateOwnership(to.x, to.y, actor.id, "FRONTIER");
        if (defenderIsBarbarian) {
          actor.points += pointsDelta;
          deps.logBarbarianEvent(`cleared by ${actor.id} @ ${to.x},${to.y}`);
        } else {
          actor.missionStats.enemyCaptures += 1;
        }
        actor.missionStats.combatWins += 1;
        if (defender) {
          if (targetWasSettled) {
            deps.seizeStoredYieldOnCapture(actor, tk);
            deps.pillageSettledTile(actor, defender, defenderTileCountBeforeCapture);
          }
          deps.incrementVendettaCount(actor.id, defender.id);
          deps.maybeIssueVendettaMission(actor, defender.id);
          const pairKey = deps.pairKeyFor(actor.id, defender.id);
          const committedAt = deps.now();
          const entries = deps.pruneRepeatFightEntries(pairKey, committedAt);
          entries.push(committedAt);
          deps.repeatFights.set(pairKey, entries);
          actor.points += pointsDelta;
        }
        deps.settleAttackManpower(actor, pending.manpowerCost, true, atkEff, defEff);
        deps.maybeIssueResourceMission(actor, to.resource);
      } else if (defenderIsBarbarian) {
        const barbarianAgentId = deps.barbarianAgentByTileKey.get(tk);
        const barbarianAgent = barbarianAgentId ? deps.barbarianAgents.get(barbarianAgentId) : undefined;
        const failedOutcome = deps.applyFailedAttackTerritoryOutcome(actor.id, undefined, true, from, to, fk, tk);
        resultChanges = failedOutcome.resultChanges;
        if (barbarianAgent) {
          const defenderTile = deps.resolveFailedBarbarianDefenseOutcome({ fortHeldOrigin: !failedOutcome.originLost, origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y } }).defenderTile;
          barbarianAgent.progress += deps.getBarbarianProgressGain(from);
          barbarianAgent.x = defenderTile.x;
          barbarianAgent.y = defenderTile.y;
          barbarianAgent.lastActionAt = deps.now();
          barbarianAgent.nextActionAt = deps.now() + BARBARIAN_ACTION_INTERVAL_MS;
          deps.upsertBarbarianAgent(barbarianAgent);
        }
        deps.settleAttackManpower(actor, pending.manpowerCost, false, atkEff, defEff);
      } else if (defenderOwnerId) {
        const failedOutcome = deps.applyFailedAttackTerritoryOutcome(actor.id, defenderOwnerId, false, from, to, fk, tk);
        resultChanges = failedOutcome.resultChanges;
        if (defender) {
          if (failedOutcome.originLost) {
            defender.missionStats.enemyCaptures += 1;
            deps.maybeIssueResourceMission(defender, from.resource);
          }
          defender.missionStats.combatWins += 1;
          deps.incrementVendettaCount(defender.id, actor.id);
          deps.maybeIssueVendettaMission(defender, actor.id);
          defender.points += pointsDelta;
        }
        deps.settleAttackManpower(actor, pending.manpowerCost, false, atkEff, defEff);
      }
      deps.recalcPlayerDerived(actor);
      if (defender) deps.recalcPlayerDerived(defender);
      deps.updateMissionState(actor);
      if (defender) deps.updateMissionState(defender);
      deps.resolveEliminationIfNeeded(actor, deps.socketsByPlayer.has(actor.id) || actor.isAi === true);
      if (defender) deps.resolveEliminationIfNeeded(defender, deps.socketsByPlayer.has(defender.id) || defender.isAi === true);
      deps.sendToPlayer(actor.id, {
        type: "COMBAT_RESULT",
        attackType: effectiveActionType,
        attackerWon: win,
        ...(lockedCombat?.winnerId ? { winnerId: lockedCombat.winnerId } : win ? { winnerId: actor.id } : defenderIsBarbarian ? { winnerId: deps.BARBARIAN_OWNER_ID } : defenderOwnerId ? { winnerId: defenderOwnerId } : {}),
        ...(lockedCombat?.defenderOwnerId ? { defenderOwnerId: lockedCombat.defenderOwnerId } : defenderIsBarbarian ? { defenderOwnerId: deps.BARBARIAN_OWNER_ID } : defenderOwnerId ? { defenderOwnerId } : {}),
        origin: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        atkEff,
        defEff,
        winChance,
        changes: resultChanges,
        pointsDelta,
        manpowerDelta,
        pillagedGold,
        pillagedShare,
        pillagedStrategic
      });
      deps.sendPostCombatFollowUps(actor.id, [{ x: from.x, y: from.y }, { x: to.x, y: to.y }], defender && !defenderIsBarbarian ? defender.id : undefined);
    }, resolvesAt - deps.now());
    const predictedResult = precomputedCombat
      ? {
          attackType: effectiveActionType,
          attackerWon: precomputedCombat.attackerWon,
          ...(precomputedCombat.winnerId ? { winnerId: precomputedCombat.winnerId } : {}),
          ...(precomputedCombat.defenderOwnerId ? { defenderOwnerId: precomputedCombat.defenderOwnerId } : {}),
          origin: { x: from.x, y: from.y },
          target: { x: to.x, y: to.y },
          changes: precomputedCombat.changes,
          pointsDelta: precomputedCombat.pointsDelta,
          manpowerDelta: precomputedCombat.manpowerDelta,
          pillagedGold: precomputedCombat.pillagedGold,
          pillagedShare: precomputedCombat.pillagedShare,
          pillagedStrategic: precomputedCombat.pillagedStrategic,
          atkEff: precomputedCombat.atkEff,
          defEff: precomputedCombat.defEff,
          winChance: precomputedCombat.winChance,
          levelDelta: 0
        }
      : undefined;
    return defender && !defenderIsBarbarian && effectiveActionType === "ATTACK"
      ? { ok: true, actionType: effectiveActionType, resolvesAt, origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y }, ...(predictedResult ? { predictedResult } : {}), attackAlert: { defenderId: defender.id, attackerId: actor.id, attackerName: actor.name, x: to.x, y: to.y, fromX: from.x, fromY: from.y, resolvesAt } }
      : { ok: true, actionType: effectiveActionType, resolvesAt, origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y }, ...(predictedResult ? { predictedResult } : {}) };
  };

  return {
    hasPendingSettlementForPlayer,
    pendingSettlementCountForPlayer,
    tileHasPendingSettlement,
    tryQueueBasicFrontierAction
  };
};

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
    manpowerDelta?: number;
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
    if (actionType === "EXPAND" && to.ownerId) return { ok: false, code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" };
    if (actionType === "ATTACK" && (!to.ownerId || to.ownerId === actor.id)) return { ok: false, code: "ATTACK_TARGET_INVALID", message: "target must be enemy-controlled land" };
    let fk = deps.key(from.x, from.y);
    const tk = deps.key(to.x, to.y);
    let fromDock = deps.docksByTile.get(fk);
    let adjacent = deps.isAdjacentTile(from.x, from.y, to.x, to.y);
    const allowAdjacentToDock = actionType !== "EXPAND";
    let dockCrossing = Boolean(fromDock && deps.validDockCrossingTarget(fromDock, to.x, to.y, allowAdjacentToDock));
    if (!adjacent && !dockCrossing && actionType === "ATTACK") {
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
    if (actor.points < deps.FRONTIER_ACTION_GOLD_COST) return { ok: false, code: "INSUFFICIENT_GOLD", message: actionType === "ATTACK" ? "insufficient gold for attack" : "insufficient gold for frontier claim" };
    deps.applyManpowerRegen(actor);
    const manpowerMin = deps.manpowerMinForAction(actionType);
    const manpowerCost = deps.manpowerCostForAction(actionType);
    if (!deps.hasEnoughManpower(actor, manpowerMin)) return { ok: false, code: "INSUFFICIENT_MANPOWER", message: `need ${manpowerMin.toFixed(0)} manpower to launch attack` };
    const defenderIsBarbarian = to.ownerId === deps.BARBARIAN_OWNER_ID;
    const defender = to.ownerId && !defenderIsBarbarian ? deps.players.get(to.ownerId) : undefined;
    if (defender && actor.allies.has(defender.id)) return { ok: false, code: "ALLY_TARGET", message: "cannot attack allied tile" };
    if (defender && defender.spawnShieldUntil > deps.now()) return { ok: false, code: "SHIELDED", message: "target shielded" };
    if (!actor.isAi && defender?.isAi) deps.markAiDefensePriority(defender.id);

    let precomputedCombat: PrecomputedFrontierCombat | undefined;
    if (defender || defenderIsBarbarian) {
      const atkEff = 10 * actor.mods.attack * deps.activeAttackBuffMult(actor.id) * deps.attackMultiplierForTarget(actor.id, to, fk) * deps.outpostAttackMultAt(actor.id, fk) * randomFactor();
      const shock = deps.breachShockByTile.get(tk);
      const shockMult = defender && shock && shock.ownerId === defender.id && shock.expiresAt > deps.now() ? deps.BREACH_SHOCK_DEF_MULT : 1;
      const defEff = defenderIsBarbarian
        ? 10 * BARBARIAN_DEFENSE_POWER * DOCK_DEFENSE_MULT * randomFactor()
        : (10 * (defender?.mods.defense ?? 1) * deps.playerDefensiveness(defender!) * shockMult * deps.fortDefenseMultAt(defender!.id, tk) * (deps.docksByTile.has(tk) ? DOCK_DEFENSE_MULT : 1) * deps.settledDefenseMultiplierForTarget(defender!.id, to) * deps.settlementDefenseMultAt(defender!.id, tk) * deps.ownershipDefenseMultiplierForTarget(defender?.id, to) + deps.frontierDefenseAddForTarget(defender!.id, to)) * randomFactor();
      const winChance = combatWinChance(atkEff, defEff);
      const win = Math.random() < winChance;
      const fortHeldOrigin = deps.originTileHeldByActiveFort(actor.id, fk);
      const previewChanges = win
        ? [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" as const }]
        : defenderIsBarbarian
          ? deps.resolveFailedBarbarianDefenseOutcome({ fortHeldOrigin, origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y } }).resultChanges
          : defender
            ? fortHeldOrigin ? [] : [{ x: from.x, y: from.y, ownerId: defender.id, ownershipState: "FRONTIER" as const }]
            : [];
      const previewWinnerId = win ? actor.id : defenderIsBarbarian ? deps.BARBARIAN_OWNER_ID : defender?.id;
      precomputedCombat = {
        atkEff,
        defEff,
        winChance,
        win,
        previewChanges,
        previewManpowerDelta: -(win ? Math.max(10, manpowerCost * 0.16) : manpowerCost * Math.min(1.25, 0.6 + (defEff / Math.max(1, atkEff)) * 0.35)),
        ...(defenderIsBarbarian ? { defenderOwnerId: deps.BARBARIAN_OWNER_ID } : defender?.id ? { defenderOwnerId: defender.id } : {}),
        ...(previewWinnerId !== undefined ? { previewWinnerId } : {})
      };
    }

    const resolvesAt = deps.now() + (actionType === "EXPAND" && !to.ownerId ? deps.frontierClaimDurationMsAt(to.x, to.y) : COMBAT_LOCK_MS);
    const pending: PendingCapture = {
      resolvesAt,
      origin: fk,
      target: tk,
      attackerId: actor.id,
      staminaCost: 0,
      manpowerCost,
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
      if (!defender && !defenderIsBarbarian) {
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
      const atkEff = pending.precomputedCombat?.atkEff ?? 10;
      const defEff = pending.precomputedCombat?.defEff ?? 10;
      const winChance = pending.precomputedCombat?.winChance ?? 0.5;
      const win = pending.precomputedCombat?.win ?? false;
      const manpowerDelta = -deps.settleAttackManpower(actor, pending.manpowerCost, win, atkEff, defEff);
      deps.applyTownWarShock(tk);
      let pillagedGold = 0;
      let pillagedShare = 0;
      let pillagedStrategic: Partial<Record<StrategicResource, number>> = {};
      let resultChanges: CombatResultChange[] = [];
      if (win) {
        const targetWasSettled = to.ownershipState === "SETTLED";
        const defenderTileCountBeforeCapture = defender ? Math.max(1, deps.settledTileCountForPlayer(defender)) : 0;
        deps.updateOwnership(to.x, to.y, actor.id, "FRONTIER");
        resultChanges = [{ x: to.x, y: to.y, ownerId: actor.id, ownershipState: "FRONTIER" }];
        if (defenderIsBarbarian) {
          actor.points += BARBARIAN_CLEAR_GOLD_REWARD;
          deps.logBarbarianEvent(`cleared by ${actor.id} @ ${to.x},${to.y}`);
        } else {
          actor.missionStats.enemyCaptures += 1;
        }
        actor.missionStats.combatWins += 1;
        if (defender) {
          if (targetWasSettled) {
            deps.seizeStoredYieldOnCapture(actor, tk);
            const pillage = deps.pillageSettledTile(actor, defender, defenderTileCountBeforeCapture);
            pillagedGold = pillage.gold;
            pillagedShare = pillage.share;
            pillagedStrategic = pillage.strategic;
          }
          deps.incrementVendettaCount(actor.id, defender.id);
          deps.maybeIssueVendettaMission(actor, defender.id);
          const pairKey = deps.pairKeyFor(actor.id, defender.id);
          const entries = deps.pruneRepeatFightEntries(pairKey, deps.now());
          entries.push(deps.now());
          deps.repeatFights.set(pairKey, entries);
          actor.points +=
            pvpPointsReward(
              deps.baseTileValue(to.resource),
              ratingFromPointsLevel(actor.points, actor.level),
              ratingFromPointsLevel(defender.points, defender.level)
            ) *
            Math.max(PVP_REPEAT_FLOOR, 0.5 ** (entries.length - 1)) *
            deps.PVP_REWARD_MULT;
        }
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
      } else if (defender) {
        resultChanges = deps.applyFailedAttackTerritoryOutcome(actor.id, defender.id, false, from, to, fk, tk).resultChanges;
        defender.missionStats.enemyCaptures += 1;
        defender.missionStats.combatWins += 1;
        deps.incrementVendettaCount(defender.id, actor.id);
        deps.maybeIssueVendettaMission(defender, actor.id);
        deps.maybeIssueResourceMission(defender, from.resource);
        defender.points +=
          pvpPointsReward(
            deps.baseTileValue(from.resource),
            ratingFromPointsLevel(defender.points, defender.level),
            ratingFromPointsLevel(actor.points, actor.level)
          ) * deps.PVP_REWARD_MULT;
      }
      deps.recalcPlayerDerived(actor);
      if (defender) deps.recalcPlayerDerived(defender);
      deps.updateMissionState(actor);
      if (defender) deps.updateMissionState(defender);
      deps.resolveEliminationIfNeeded(actor, deps.socketsByPlayer.has(actor.id) || actor.isAi === true);
      if (defender) deps.resolveEliminationIfNeeded(defender, deps.socketsByPlayer.has(defender.id) || defender.isAi === true);
      deps.sendToPlayer(actor.id, {
        type: "COMBAT_RESULT",
        attackType: actionType,
        attackerWon: win,
        ...(win ? { winnerId: actor.id } : defenderIsBarbarian ? { winnerId: deps.BARBARIAN_OWNER_ID } : defender?.id ? { winnerId: defender.id } : {}),
        ...(defenderIsBarbarian ? { defenderOwnerId: deps.BARBARIAN_OWNER_ID } : defender?.id ? { defenderOwnerId: defender.id } : {}),
        origin: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y },
        atkEff,
        defEff,
        winChance,
        changes: resultChanges,
        manpowerDelta,
        pillagedGold,
        pillagedShare,
        pillagedStrategic
      });
      deps.sendPostCombatFollowUps(actor.id, [{ x: from.x, y: from.y }, { x: to.x, y: to.y }], defender && !defenderIsBarbarian ? defender.id : undefined);
    }, resolvesAt - deps.now());
    const predictedResult = precomputedCombat ? { attackType: actionType, attackerWon: precomputedCombat.win, origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y }, changes: precomputedCombat.previewChanges, ...(precomputedCombat.previewWinnerId ? { winnerId: precomputedCombat.previewWinnerId } : {}), ...(precomputedCombat.defenderOwnerId ? { defenderOwnerId: precomputedCombat.defenderOwnerId } : {}), ...(typeof precomputedCombat.previewManpowerDelta === "number" ? { manpowerDelta: precomputedCombat.previewManpowerDelta } : {}) } : undefined;
    return defender && !defenderIsBarbarian && actionType === "ATTACK"
      ? { ok: true, resolvesAt, origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y }, ...(predictedResult ? { predictedResult } : {}), attackAlert: { defenderId: defender.id, attackerId: actor.id, attackerName: actor.name, x: to.x, y: to.y, fromX: from.x, fromY: from.y, resolvesAt } }
      : { ok: true, resolvesAt, origin: { x: from.x, y: from.y }, target: { x: to.x, y: to.y }, ...(predictedResult ? { predictedResult } : {}) };
  };

  return {
    hasPendingSettlementForPlayer,
    pendingSettlementCountForPlayer,
    tileHasPendingSettlement,
    tryQueueBasicFrontierAction
  };
};

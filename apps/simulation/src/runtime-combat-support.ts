import type { CommandEnvelope, LockedFrontierCombatResult, SimulationEvent } from "@border-empires/sim-protocol";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  BREAKTHROUGH_DURATION_MS,
  attackManpowerLoss,
  rollFrontierCombat,
  rollSettledAttackManpowerLoss,
  targetOutpostMult,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  wrapX,
  wrapY,
  type BuildableStructureType,
  type FrontierCombatPreview,
  type OutpostPosition
} from "@border-empires/shared";
import * as wonderEffects from "./runtime-natural-wonders.js"; import { simulationTileKey } from "./seed-state/seed-state.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { isTownInCaptureShock } from "./runtime-structure-rules/runtime-structure-rules.js";
import type { LockRecord, LockedCombatResolution, RuntimePlayer, SimulationTileWireDelta, StrategicResourceKey } from "./runtime-types.js";
import { multiplicativeEffectForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import {
  noWarIndustryVulnerabilityLabelForAttacker,
  noWarIndustryVulnerabilityLabelForDefender,
  noWarIndustryVulnerabilityMultForAttacker,
  noWarIndustryVulnerabilityMultForDefender,
  titaniumWeaponsFactoryAttackMultForPlayer,
  titaniumWeaponsFactoryDefenseMultForPlayer,
  umbriteWeaponsFactoryAttackMultForPlayer,
  umbriteWeaponsFactoryDefenseMultForPlayer,
  weaponsWorkshopAttackMultForPlayer,
  weaponsWorkshopDefenseMultForPlayer
} from "./runtime-weapons-factory-mults.js";

export type RuntimeCombatSupportContext = {
  now: () => number;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  locksByTile: Map<string, LockRecord>;
  locksByCommandId: Map<string, LockRecord>;
  barbarianTileProgress: Map<string, number>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  tileDeltaRevealOnly: (tile: DomainTileState, playerId: string) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: Pick<CommandEnvelope, "commandId" | "playerId">) => void;
  // §5.4: true when the given structure field is currently unpowered
  // (its resource demand isn't covered by supply) — a dormant Fort/Siege
  // Outpost/Wooden Fort doesn't grant its combat bonus.
  isStructureDormant: (playerId: string, tileKey: string, field: "fort" | "observatory" | "siegeOutpost" | "economicStructure") => boolean;
  manpowerLossByTileKey: Map<string, number>;
  // Titanium/Umbrite Weapons Factory combat bonus is empire-wide (like the
  // legacy Weapons Workshop below), not scoped to a connected-town network —
  // ownedStructureCountForPlayer already counts every copy the player owns
  // anywhere. Town-network membership (ConnectedTownNetworkEntry) still
  // exists for other purposes (Rail Depot/Garrison Hall uniqueness, the tile
  // overview's "connected network" display) but no longer gates combat.
  ownedStructureCountForPlayer: (playerId: string, structureType: BuildableStructureType) => number;
  // GET /api/activity's combat-manpower-log (manpowerLost24h/biggestBattle24h
  // -- see combat-manpower-log/). Separate from manpowerLossByTileKey above,
  // which is a season-cumulative per-tile total consumed only at season end
  // (season-crowning.ts); this is a 24h-windowed, timestamped, attacker-
  // attributed feed. Optional so existing test fixtures that build a bare
  // RuntimeCombatSupportContext don't all need updating.
  recordCombatManpowerLoss?: (loss: {
    attackerId: string;
    defenderId: string | undefined;
    attackerWon: boolean;
    manpowerLoss: number;
    x: number;
    y: number;
    at: number;
  }) => void;
};

export type LockedCombatInput = Pick<
  LockRecord,
  "actionType" | "commandId" | "playerId" | "manpowerCost" | "originKey" | "originX" | "originY" | "targetX" | "targetY" | "targetKey"
>;

export const plannerGatingLockPlayerIds = (locksByTile: ReadonlyMap<string, LockRecord>): Set<string> => {
  const lockPlayerIds = new Set<string>();
  for (const lock of locksByTile.values()) {
    if (lock.source === "automation") continue;
    lockPlayerIds.add(lock.playerId);
  }
  return lockPlayerIds;
};

export const activeFrontierLocksForPlayer = (locksByTile: ReadonlyMap<string, LockRecord>, playerId: string): LockRecord[] => {
  const locks = new Map<string, LockRecord>();
  for (const lock of locksByTile.values()) {
    if (lock.playerId !== playerId) continue;
    if (lock.actionType !== "EXPAND" && lock.actionType !== "ATTACK") continue;
    locks.set(lock.commandId, lock);
  }
  return [...locks.values()].sort((left, right) => left.commandId.localeCompare(right.commandId));
};

export const handleCancelCaptureCommand = (ctx: RuntimeCombatSupportContext, command: CommandEnvelope): void => {
  const actor = ctx.players.get(command.playerId);
  if (!actor) {
    ctx.emitEvent({
      eventType: "COMMAND_REJECTED",
      commandId: command.commandId,
      playerId: command.playerId,
      code: "BAD_COMMAND",
      message: "invalid command payload"
    });
    return;
  }

  const activeLocks = activeFrontierLocksForPlayer(ctx.locksByTile, command.playerId);
  if (activeLocks.length === 0) {
    ctx.emitEvent({
      eventType: "COMMAND_REJECTED",
      commandId: command.commandId,
      playerId: command.playerId,
      code: "NO_ACTIVE_CAPTURE",
      message: "no active capture to cancel"
    });
    return;
  }

  for (const lock of activeLocks) {
    ctx.locksByTile.delete(lock.originKey); ctx.locksByTile.delete(lock.targetKey);
    ctx.locksByCommandId.delete(lock.commandId);
    if (lock.actionType === "EXPAND") actor.manpower += lock.manpowerCost; // refunds the up-front EXPAND charge from runtime-frontier-command.ts
  }

  ctx.emitEvent({
    eventType: "COMBAT_CANCELLED",
    commandId: command.commandId,
    playerId: command.playerId,
    count: activeLocks.length,
    cancelledCommandIds: activeLocks.map((lock) => lock.commandId)
  });
  ctx.emitPlayerStateUpdate(command);
};

export const originTileHeldByActiveFort = (
  tiles: ReadonlyMap<string, DomainTileState>,
  now: () => number,
  playerId: string,
  originKey: string,
  isStructureDormant: RuntimeCombatSupportContext["isStructureDormant"] = () => false
): boolean => {
  const origin = tiles.get(originKey);
  if (!origin || origin.terrain !== "LAND" || origin.ownerId !== playerId) return false;
  const activeFort =
    origin.fort?.ownerId === playerId &&
    origin.fort.status === "active" &&
    (origin.fort.disabledUntil ?? 0) <= now() &&
    !isStructureDormant(playerId, originKey, "fort");
  const activeWoodenFort =
    origin.economicStructure?.ownerId === playerId &&
    origin.economicStructure.type === "WOODEN_FORT" &&
    origin.economicStructure.status === "active" &&
    !isStructureDormant(playerId, originKey, "economicStructure");
  return activeFort || activeWoodenFort;
};

export const attackerOutpostMult = (ctx: RuntimeCombatSupportContext, playerId: string, targetX: number, targetY: number): number => {
  const summary = ctx.summaryForPlayer(playerId);
  const outposts: OutpostPosition[] = [];
  for (const tileKey of summary.territoryTileKeys) {
    const tile = ctx.tiles.get(tileKey);
    if (!tile) continue;
    // Fixed-border reach: an unsettled (dormant) tile's structures don't
    // project an aura, even if the structure fields are still present.
    if (tile.ownershipState !== "SETTLED") continue;
    if (
      tile.siegeOutpost?.ownerId === playerId &&
      tile.siegeOutpost.status === "active" &&
      !ctx.isStructureDormant(playerId, tileKey, "siegeOutpost")
    ) {
      outposts.push({ x: tile.x, y: tile.y, variant: tile.siegeOutpost.variant ?? "SIEGE_OUTPOST" });
    }
  }
  return targetOutpostMult(outposts, targetX, targetY);
};

// EXPAND always targets unowned land (validated before the lock is created)
// and always succeeds, so there's nothing to roll for. The trivial preview
// below stands in for the full attacker/defender combat math (outpost scan,
// tech multipliers, fort/dock defense) that ATTACK needs but EXPAND can't
// change the outcome with.
const EXPAND_TRIVIAL_SIDE_BREAKDOWN = { base: 0, infrastructure: [], infrastructureMult: 1, effectiveBase: 0, battle: [], battleMult: 1, effective: 0 };
const EXPAND_COMBAT_PREVIEW: FrontierCombatPreview & { attackerWon: true } = {
  atkEff: 0,
  defEff: 0,
  atkMult: 1,
  defMult: 0,
  winChance: 1,
  attackerWon: true,
  attacker: EXPAND_TRIVIAL_SIDE_BREAKDOWN,
  defender: EXPAND_TRIVIAL_SIDE_BREAKDOWN
};


// Whether the target's fort actually grants its combat bonus: active,
// owned by the defender, and not resource-dormant (§5.4). Shared between
// resolveAttackCombat (combat-power calculation) and
// buildLockedCombatResolution (manpower-loss-range lookup) so the two
// can't drift on what counts as "has an active fort" for the same attack.
const targetHasActiveFortFor = (
  ctx: RuntimeCombatSupportContext,
  previousTarget: DomainTileState | undefined,
  defenderOwnerId: string | undefined,
  targetKey: string
): boolean =>
  Boolean(
    previousTarget?.fort &&
      previousTarget.fort.status === "active" &&
      previousTarget.fort.ownerId === defenderOwnerId &&
      defenderOwnerId &&
      !ctx.isStructureDormant(defenderOwnerId, targetKey, "fort")
  );

const resolveAttackCombat = (
  ctx: RuntimeCombatSupportContext,
  lock: LockedCombatInput,
  previousTarget: DomainTileState | undefined,
  defenderOwnerId: string | undefined,
  defender: RuntimePlayer | undefined
): FrontierCombatPreview & { attackerWon: boolean } => {
  const outpostMult = attackerOutpostMult(ctx, lock.playerId, lock.targetX, lock.targetY);
  const attacker = ctx.players.get(lock.playerId); const dockAttackMult = wonderEffects.dockAttackMultiplierForOrigin(attacker, ctx.tiles.get(lock.originKey), lock.playerId);
  const targetHasActiveFort = targetHasActiveFortFor(ctx, previousTarget, defenderOwnerId, lock.targetKey);
  const combatModifiers = {
    attackerOutpostMult: outpostMult,
    dockAttackMult,
    attackVsSettledMult: attacker ? multiplicativeEffectForPlayer(attacker, "attackVsSettledMult") : 1,
    attackVsFortsMult: attacker ? multiplicativeEffectForPlayer(attacker, "attackVsFortsMult") : 1,
    attackVsBarbariansMult: attacker ? multiplicativeEffectForPlayer(attacker, "attackVsBarbariansMult") : 1,
    defenderOwnerId: defenderOwnerId,
    fortDefenseMult: defender ? (multiplicativeEffectForPlayer(defender, "fortDefenseMult") + (defender.wonderFortDefenseBonus ?? 0)) : 1,
    nowMs: ctx.now(),
    // Legacy Weapons Workshop — retired (structure-registry-economic.ts),
    // kept wired for any copy a player already owns.
    weaponsWorkshopAttackMult: weaponsWorkshopAttackMultForPlayer(ctx, lock.playerId),
    weaponsWorkshopDefenseMult: weaponsWorkshopDefenseMultForPlayer(ctx, defenderOwnerId),
    // Titanium/Umbrite Weapons Factory — empire-wide, same convention as
    // weaponsWorkshopAttackMult/DefenseMult above (each side only ever
    // supplies its own side's field).
    titaniumWeaponsFactoryAttackMult: titaniumWeaponsFactoryAttackMultForPlayer(ctx, lock.playerId),
    titaniumWeaponsFactoryDefenseMult: titaniumWeaponsFactoryDefenseMultForPlayer(ctx, defenderOwnerId),
    umbriteWeaponsFactoryAttackMult: umbriteWeaponsFactoryAttackMultForPlayer(ctx, lock.playerId),
    umbriteWeaponsFactoryDefenseMult: umbriteWeaponsFactoryDefenseMultForPlayer(ctx, defenderOwnerId),
    noWarIndustryVulnerabilityMult: noWarIndustryVulnerabilityMultForDefender(ctx, defenderOwnerId),
    noWarIndustryVulnerabilityLabel: defenderOwnerId ? noWarIndustryVulnerabilityLabelForDefender(ctx, defenderOwnerId) : undefined,
    noWarIndustryDefenseVulnerabilityMult: noWarIndustryVulnerabilityMultForAttacker(ctx, lock.playerId),
    noWarIndustryDefenseVulnerabilityLabel: noWarIndustryVulnerabilityLabelForAttacker(ctx, lock.playerId),
    // General tech/domain "attack"/"defense" stat mods (e.g. Titanium Dominion's
    // +18% attack/defense) — persistent infrastructure, same tier as weapons
    // factories, previously computed but never actually applied to combat.
    attackerStatMult: attacker?.mods?.attack ?? 1,
    defenderStatMult: defender?.mods?.defense ?? 1
  };
  const targetForCombat: Parameters<typeof rollFrontierCombat>[0] = previousTarget
    ? {
        terrain: previousTarget.terrain,
        ownershipState: previousTarget.ownershipState,
        dockId: previousTarget.dockId,
        townType: previousTarget.town?.type,
        fortVariant: targetHasActiveFort ? previousTarget.fort?.variant : undefined,
        breachShockUntil: previousTarget.breachShockUntil
      }
    : { terrain: "LAND" };
  return rollFrontierCombat(targetForCombat, "ATTACK", undefined, combatModifiers);
};

export const buildLockedCombatResolution = (ctx: RuntimeCombatSupportContext, lock: LockedCombatInput): LockedCombatResolution | undefined => {
  const previousTarget = ctx.tiles.get(lock.targetKey);
  const defenderOwnerId = previousTarget?.ownerId;
  const defender = defenderOwnerId ? ctx.players.get(defenderOwnerId) : undefined;
  const combat: FrontierCombatPreview & { attackerWon: boolean } =
    lock.actionType === "EXPAND" ? EXPAND_COMBAT_PREVIEW : resolveAttackCombat(ctx, lock, previousTarget, defenderOwnerId, defender);
  const targetWasSettled = previousTarget?.ownershipState === "SETTLED";
  const targetRecentlyPillaged = isTownInCaptureShock(previousTarget?.town, ctx.now());
  const defenderTileCountBeforeCapture = defenderOwnerId ? Math.max(1, ctx.summaryForPlayer(defenderOwnerId).settledTileCount) : 0;
  const plunder =
    combat.attackerWon && defender && targetWasSettled && previousTarget && !targetRecentlyPillaged
      ? previewSettledCapturePlunder({ defender, defenderTileCountBeforeCapture, target: previousTarget })
      : undefined;
  const targetHasActiveFort = targetHasActiveFortFor(ctx, previousTarget, defenderOwnerId, lock.targetKey);
  const manpowerLoss = lock.actionType !== "ATTACK"
    ? 0
    : targetWasSettled
      ? rollSettledAttackManpowerLoss(targetHasActiveFort ? previousTarget?.fort?.variant : undefined)
      : attackManpowerLoss(lock.manpowerCost, combat.attackerWon, combat.atkEff, combat.defEff);
  if (manpowerLoss > 0) {
    const existing = ctx.manpowerLossByTileKey.get(lock.targetKey) ?? 0;
    ctx.manpowerLossByTileKey.set(lock.targetKey, existing + manpowerLoss);
    ctx.recordCombatManpowerLoss?.({
      attackerId: lock.playerId,
      defenderId: defenderOwnerId,
      attackerWon: combat.attackerWon,
      manpowerLoss,
      x: lock.targetX,
      y: lock.targetY,
      at: ctx.now()
    });
  }
  // EXPAND's manpower cost (§4.2) is a flat spend on success, not a combat-loss
  // formula like ATTACK's — it always succeeds against neutral land (see
  // EXPAND_COMBAT_PREVIEW above), so the full lock.manpowerCost is paid.
  const manpowerDelta = lock.actionType === "EXPAND" ? -lock.manpowerCost : -manpowerLoss;
  const originHeldByFort = originTileHeldByActiveFort(ctx.tiles, ctx.now, lock.playerId, lock.originKey, ctx.isStructureDormant);
  const result: LockedFrontierCombatResult = {
    attackType: lock.actionType,
    attackerWon: combat.attackerWon,
    ...(combat.attackerWon ? { winnerId: lock.playerId } : defenderOwnerId ? { winnerId: defenderOwnerId } : {}),
    ...(defenderOwnerId ? { defenderOwnerId } : {}),
    origin: { x: lock.originX, y: lock.originY },
    target: { x: lock.targetX, y: lock.targetY },
    changes: combat.attackerWon
      ? [{ x: lock.targetX, y: lock.targetY, ownerId: lock.playerId, ownershipState: lock.playerId === "barbarian-1" ? "SETTLED" : "FRONTIER" }]
      : defenderOwnerId && !originHeldByFort
        ? [{ x: lock.originX, y: lock.originY, ownerId: defenderOwnerId, ownershipState: defenderOwnerId === "barbarian-1" ? "SETTLED" : "FRONTIER" }]
        : [],
    pointsDelta: 0,
    manpowerDelta,
    pillagedGold: plunder?.gold ?? 0,
    pillagedShare: plunder?.share ?? 0,
    pillagedStrategic: plunder?.strategic ?? {},
    atkEff: combat.atkEff,
    defEff: combat.defEff,
    winChance: combat.winChance,
    levelDelta: 0
  };
  return { result, defenderGoldLoss: plunder?.defenderGoldLoss ?? 0, targetRecentlyPillaged };
};

export { barbarianProgressGain, applyBarbarianWalkOrMultiply } from "./runtime-barbarian-walk.js";

export const BARBARIAN_CAPTURE_PLUNDER_GOLD = 10;

// Plunder is gold-only by design (see AGENTS.md-adjacent design discussion): capturing a
// resource tile does not steal strategic resources, only a share of the defender's gold.
// `strategic` stays empty here — it used to be seeded with a hardcoded `{ FOOD: 1 }` for
// FARM/FISH tiles that was never actually transferred to the attacker, which made the
// client display a fake "plundered 1 FOOD" that had no effect on either player's stockpile.
export const previewSettledCapturePlunder = (input: {
  defender: DomainPlayer;
  defenderTileCountBeforeCapture: number;
  target: DomainTileState;
}): { gold: number; share: number; defenderGoldLoss: number; strategic: Partial<Record<StrategicResourceKey, number>> } => {
  const strategic: Partial<Record<StrategicResourceKey, number>> = {};

  if (input.defender.id === "barbarian-1") {
    return { gold: BARBARIAN_CAPTURE_PLUNDER_GOLD, share: 0, defenderGoldLoss: BARBARIAN_CAPTURE_PLUNDER_GOLD, strategic };
  }

  const share = 1 / Math.max(1, input.defenderTileCountBeforeCapture);
  const defenderGoldShare = Math.max(0, input.defender.points * share);
  const storedYieldGold = input.target.town ? 1 : 0;
  const gold = Math.round((defenderGoldShare + storedYieldGold) * 100) / 100;
  return { gold, share, defenderGoldLoss: defenderGoldShare, strategic };
};

export const applySettledCapturePlunder = (input: {
  attacker: DomainPlayer;
  defender: DomainPlayer;
  gold: number;
  defenderGoldLoss: number;
}): void => {
  if (input.gold <= 0) return;
  input.defender.points = Math.max(0, input.defender.points - input.defenderGoldLoss);
  input.attacker.points += input.gold;
};

export { attackManpowerLoss };

export const applyLockedManpowerDelta = (player: DomainPlayer, manpowerDelta: number): number => {
  if (manpowerDelta >= -0.01) return 0;
  const loss = Math.abs(manpowerDelta);
  player.manpower = Math.max(0, player.manpower - loss);
  return loss;
};

export const settleAttackManpower = (
  player: DomainPlayer,
  committedManpower: number,
  attackerWon: boolean,
  atkEff: number,
  defEff: number
): number => {
  const loss = attackManpowerLoss(committedManpower, attackerWon, atkEff, defEff);
  player.manpower = Math.max(0, player.manpower - loss);
  return loss;
};

/**
 * After a successful capture, mark the 4 cardinal enemy-owned neighbours of
 * the captured tile with a breach window. Callers must emit tile deltas for
 * any returned updated tiles.
 *
 * Only tiles owned by a different player than the attacker are breached.
 */
export const applyBreachToNeighbors = (input: {
  capturedTile: DomainTileState;
  attackerId: string;
  nowMs: number;
  tiles: Map<string, DomainTileState>;
  invalidateTileStringifyCache: (key: string) => void;
}): DomainTileState[] => {
  const { capturedTile, attackerId, nowMs, tiles, invalidateTileStringifyCache } = input;
  const breachUntil = nowMs + BREAKTHROUGH_DURATION_MS;
  const updated: DomainTileState[] = [];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const key = simulationTileKey(wrapX(capturedTile.x + dx, WORLD_WIDTH), wrapY(capturedTile.y + dy, WORLD_HEIGHT));
    const neighbor = tiles.get(key);
    if (!neighbor?.ownerId || neighbor.ownerId === attackerId) continue;
    if ((neighbor.breachShockUntil ?? 0) >= breachUntil) continue;
    const updated_tile = { ...neighbor, breachShockUntil: breachUntil };
    tiles.set(key, updated_tile);
    invalidateTileStringifyCache(key);
    updated.push(updated_tile);
  }
  return updated;
};

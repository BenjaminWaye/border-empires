import type { PlayerRespawnNotice, PlayerRespawnReasonCode } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import { POPULATION_MAX } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { buildRewritePlayerRespawnNotice, type PendingRespawnNoticeContext } from "./player-respawn-notice.js";
import { chooseLegacySpawnPlacement } from "./spawn-placement/spawn-placement.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { SYNTHETIC_SETTLEMENT_POPULATION } from "./runtime-hydration.js";
import { createHumanRuntimePlayer } from "./runtime-player-factory.js";
import { createEmptyPlayerRuntimeSummary, type PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { RuntimePlayer, SimulationTileWireDelta } from "./runtime-types.js";

export type RuntimeRespawnContext = {
  now: () => number;
  players: Map<string, RuntimePlayer>;
  tiles: Map<string, DomainTileState>;
  playerSummaries: Map<string, PlayerRuntimeSummary>;
  plannerPlayerTileCollectionVersionByPlayer: Map<string, number>;
  pendingRespawnNoticeByPlayerId: Map<string, PendingRespawnNoticeContext>;
  lastRespawnNoticeByPlayerId: Map<string, PlayerRespawnNotice>;
  pendingSettlementsByTile: ReadonlyMap<string, unknown>;
  locksByTile: ReadonlyMap<string, unknown>;
  rememberedAutomationVictoryPathByPlayer: Map<string, unknown>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  setTileYieldCollectedAt: (commandId: string, playerId: string, tileKey: string, collectedAt: number) => void;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
  incomePerMinuteForPlayer: (playerId: string) => number;
  respawnMinimumGold: number;
  incrementAuthRecoveryRespawn: () => void;
  incrementAuthRecoveryRespawnGuarded: () => void;
};

export const preparePlayerRespawnNotice = (
  ctx: RuntimeRespawnContext,
  playerId: string,
  reasonCode: PlayerRespawnReasonCode,
  triggerEvent: string,
  options?: { wasOnline?: boolean }
): void => {
  const player = ctx.players.get(playerId);
  const territoryTiles = ctx.summaryForPlayer(playerId).territoryTileKeys.size;
  if (player?.isAi === true) return;
  ctx.pendingRespawnNoticeByPlayerId.set(playerId, {
    at: ctx.now(),
    reasonCode,
    triggerEvent,
    previousTerritoryTiles: territoryTiles,
    previousTerritoryStrength: 0,
    previousExposure: 0,
    wasEliminated: false,
    respawnPending: territoryTiles === 0,
    ...(typeof options?.wasOnline === "boolean" ? { wasOnline: options.wasOnline } : {})
  });
};

export const finalizeRespawnNotice = (ctx: RuntimeRespawnContext, playerId: string, spawnTileKey: string): void => {
  const pending = ctx.pendingRespawnNoticeByPlayerId.get(playerId);
  if (!pending) return;
  const player = ctx.players.get(playerId);
  const notice = buildRewritePlayerRespawnNotice({
    playerId,
    playerName: player?.name ?? playerId,
    context: pending,
    spawnTileKey: spawnTileKey as `${number},${number}`
  });
  ctx.lastRespawnNoticeByPlayerId.set(playerId, notice);
  ctx.pendingRespawnNoticeByPlayerId.delete(playerId);
};

export const ensurePlayerHasSpawnTerritory = (
  ctx: RuntimeRespawnContext,
  playerId: string,
  rallyAnchor?: { x: number; y: number }
): boolean => {
  let player = ctx.players.get(playerId);
  if (!player) {
    player = createHumanRuntimePlayer(playerId);
    ctx.players.set(playerId, player);
    if (!ctx.playerSummaries.has(playerId)) {
      ctx.playerSummaries.set(playerId, createEmptyPlayerRuntimeSummary());
      ctx.plannerPlayerTileCollectionVersionByPlayer.set(playerId, 0);
    }
  }
  const territoryTiles = ctx.summaryForPlayer(playerId).territoryTileKeys.size;
  const hasPendingNotice = ctx.pendingRespawnNoticeByPlayerId.has(playerId);
  if (territoryTiles > 0) return false;
  // World-sanity guard: territoryTiles reads 0 from the same in-memory
  // ctx.tiles map that backs every other tile-ownership check, so a genuine
  // zero for one player is trustworthy only if the world itself actually
  // loaded. If ctx.tiles is empty, startup recovery (or a mid-session
  // restore) has not populated territory data yet/failed to — placing a
  // fresh auth_recovery spawn here would silently overwrite the player's
  // real empire once the world does load. Refuse and surface it instead.
  if (ctx.tiles.size === 0) {
    ctx.incrementAuthRecoveryRespawnGuarded();
    ctx.runtimeLogInfo(
      { type: "auth_recovery_respawn_guarded", playerId, territoryTiles, worldTileCount: ctx.tiles.size },
      "skipped auth_recovery respawn: world tiles not loaded"
    );
    return false;
  }
  if (!player.isAi) {
    if (!hasPendingNotice) preparePlayerRespawnNotice(ctx, playerId, "auth_recovery", "ensure_player_has_spawn_territory");
    ctx.incrementAuthRecoveryRespawn();
  }
  const blockedTileKeys = new Set<string>([...ctx.pendingSettlementsByTile.keys(), ...ctx.locksByTile.keys()]);
  ctx.rememberedAutomationVictoryPathByPlayer.delete(playerId);
  const spawn = chooseLegacySpawnPlacement({ playerId, tiles: ctx.tiles.values(), blockedTileKeys, ...(rallyAnchor ? { rallyAnchor } : {}) });
  if (!spawn) return false;
  const tileKey = simulationTileKey(spawn.x, spawn.y);
  const tile = ctx.tiles.get(tileKey);
  if (!tile || tile.terrain !== "LAND" || tile.ownerId) return false;
  const spawnedTile: DomainTileState = {
    ...tile,
    ownerId: playerId,
    ownershipState: "SETTLED",
    town: tile.town ?? { name: `Settlement ${tile.x},${tile.y}`, type: "FARMING", populationTier: "SETTLEMENT", population: 800, maxPopulation: POPULATION_MAX }
  };
  const commandId = `bootstrap-spawn:${playerId}:${ctx.now()}`;
  ctx.setTileYieldCollectedAt(commandId, playerId, tileKey, ctx.now());
  ctx.replaceTileState(tileKey, spawnedTile);
  finalizeRespawnNotice(ctx, playerId, tileKey);
  ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [ctx.tileDeltaFromState(spawnedTile)] });
  ctx.emitPlayerStateUpdate({ commandId, playerId });
  return true;
};

export const respawnPlayerOnUnownedLand = (ctx: RuntimeRespawnContext, playerId: string, commandId: string): boolean => {
  const actor = ctx.players.get(playerId);
  if (!actor) return false;
  if (!actor.isAi && !ctx.pendingRespawnNoticeByPlayerId.has(playerId)) preparePlayerRespawnNotice(ctx, playerId, "auth_recovery", commandId, { wasOnline: true });
  const blockedTileKeys = new Set<string>([...ctx.pendingSettlementsByTile.keys(), ...ctx.locksByTile.keys()]);
  const spawn = chooseLegacySpawnPlacement({ playerId, tiles: ctx.tiles.values(), blockedTileKeys });
  if (!spawn) return false;
  const respawnedTileKey = simulationTileKey(spawn.x, spawn.y);
  const tile = ctx.tiles.get(respawnedTileKey);
  if (!tile || tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId) return false;
  const respawnedTile: DomainTileState = {
    ...tile,
    ownerId: playerId,
    ownershipState: "SETTLED",
    town: {
      name: `Respawn ${tile.x},${tile.y}`,
      type: "FARMING",
      populationTier: "SETTLEMENT",
      population: SYNTHETIC_SETTLEMENT_POPULATION,
      maxPopulation: POPULATION_MAX
    }
  };
  actor.manpower = Math.max(actor.manpower, 100);
  actor.points = Math.max(actor.points, ctx.respawnMinimumGold);
  const respawnCommandId = `${commandId}:respawn:${playerId}`;
  ctx.setTileYieldCollectedAt(respawnCommandId, playerId, respawnedTileKey, ctx.now());
  ctx.replaceTileState(respawnedTileKey, respawnedTile, respawnCommandId);
  finalizeRespawnNotice(ctx, playerId, respawnedTileKey);
  ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: respawnCommandId, playerId, tileDeltas: [ctx.tileDeltaFromState(respawnedTile)] });
  ctx.emitPlayerStateUpdate({ commandId: respawnCommandId, playerId });
  ctx.runtimeLogInfo(
    {
      type: "respawn_placed",
      playerId,
      commandId: respawnCommandId,
      tileKey: respawnedTileKey,
      goldIncomePerMinute: ctx.summaryForPlayer(playerId).goldIncomePerMinute,
      incomePerMinute: ctx.incomePerMinuteForPlayer(playerId)
    },
    "placed respawn settlement"
  );
  return true;
};

export const respawnIfEliminated = (ctx: RuntimeRespawnContext, playerId: string, commandId: string): void => {
  const actor = ctx.players.get(playerId);
  if (!actor) return;
  if (ctx.summaryForPlayer(playerId).territoryTileKeys.size > 0) return;
  if (!actor.isAi && !ctx.pendingRespawnNoticeByPlayerId.has(playerId)) {
    preparePlayerRespawnNotice(ctx, playerId, "eliminated", commandId, { wasOnline: true });
  }

  const barbTileCount = ctx.summaryForPlayer("barbarian-1").territoryTileKeys.size;
  ctx.runtimeLogInfo(
    { type: "player_eliminated", playerId, commandId, isAi: actor.isAi, barbTileCount },
    "player eliminated — attempting respawn"
  );

  const blockedTileKeys = new Set<string>([...ctx.pendingSettlementsByTile.keys(), ...ctx.locksByTile.keys()]);
  const spawn = chooseLegacySpawnPlacement({ playerId, tiles: ctx.tiles.values(), blockedTileKeys });
  if (!spawn) return;
  const respawnedTileKey = simulationTileKey(spawn.x, spawn.y);
  const tile = ctx.tiles.get(respawnedTileKey);
  if (!tile || tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId) return;
  const respawnedTile: DomainTileState = {
    ...tile,
    ownerId: playerId,
    ownershipState: "SETTLED",
    town: {
      name: `Respawn ${tile.x},${tile.y}`,
      type: "FARMING",
      populationTier: "SETTLEMENT",
      population: SYNTHETIC_SETTLEMENT_POPULATION,
      maxPopulation: POPULATION_MAX
    }
  };
  actor.manpower = Math.max(actor.manpower, 100);
  actor.points = Math.max(actor.points, ctx.respawnMinimumGold);
  const respawnCommandId = `${commandId}:respawn:${playerId}`;
  ctx.setTileYieldCollectedAt(respawnCommandId, playerId, respawnedTileKey, ctx.now());
  ctx.replaceTileState(respawnedTileKey, respawnedTile, respawnCommandId);
  finalizeRespawnNotice(ctx, playerId, respawnedTileKey);
  ctx.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: respawnCommandId,
    playerId,
    tileDeltas: [ctx.tileDeltaFromState(respawnedTile)]
  });
  if (!actor.isAi) ctx.emitPlayerStateUpdate({ commandId: respawnCommandId, playerId });
};

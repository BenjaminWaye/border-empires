import type { PlayerRespawnNotice, PlayerRespawnReasonCode } from "@border-empires/shared";
import { hasWaterNeighbor, type DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { buildRewritePlayerRespawnNotice, type PendingRespawnNoticeContext } from "./player-respawn-notice.js";
import { chooseLegacySpawnPlacement, RALLY_SPAWN_RADIUS } from "./spawn-placement/spawn-placement.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { hasBarbarianWithin } from "./spawn-placement/barbarian-proximity.js";
import { prepareAfcLandingFootprint } from "./afc-landing-footprint/afc-landing-footprint.js";
import { clearBarbariansAroundAfcLanding } from "./afc-landing-footprint/afc-landing-barbarian-clear.js";
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
  /** Invalidates terrain-derived caches after the AFC landing flattens mountains (same as REMOVE_MOUNTAIN). */
  bumpTerrainEpoch: () => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
  incomePerMinuteForPlayer: (playerId: string) => number;
  respawnMinimumGold: number;
  incrementAuthRecoveryRespawn: () => void;
  incrementAuthRecoveryRespawnGuarded: () => void;
  // Cached/incrementally-maintained, spatially-indexed lookups threaded
  // through to chooseLegacySpawnPlacement — see SpawnPlacementIndex and
  // LegacySpawnPlacementInput's matching fields. Passing these avoids both
  // re-scanning every tile on the map AND linearly scanning every owned tile
  // on every single spawn/respawn placement, which load testing showed
  // costing ~700-900ms per new player connecting at 100-tile-map-scale.
  coastalLandKeys: () => ReadonlySet<string>;
  hasNearbySettled: (x: number, y: number, radius: number) => boolean;
  hasNearbyTown: (x: number, y: number, radius: number) => boolean;
  hasNearbyFood: (x: number, y: number, radius: number) => boolean;
  // Precomputed, equal-opportunity worldgen spawn roster (see
  // computeFairSpawnSites/SpawnPlacementIndex.claimFairSpawnSite). Tried
  // before falling back to chooseLegacySpawnPlacement's per-player random
  // search, which stays as the fallback once the roster is exhausted.
  claimFairSpawnSite: (isAvailable: (x: number, y: number) => boolean, rallyAnchor?: { x: number; y: number }) => { x: number; y: number } | undefined;
};

// Same minSpawnDistance as chooseLegacySpawnPlacement's strictest search
// pass (LEGACY_SPAWN_SEARCH_ORDER's first tier) — a precomputed site too
// close to an already-settled empire is rejected here rather than handed
// out, so it falls through to the legacy random search's own relaxation
// passes instead of placing a new player right on someone's doorstep.
const FAIR_SPAWN_SITE_MIN_SETTLED_DISTANCE = 50;

const isSpawnableTile = (ctx: RuntimeRespawnContext, blockedTileKeys: ReadonlySet<string>) => (x: number, y: number): boolean => {
  const tile = ctx.tiles.get(simulationTileKey(x, y));
  if (!tile || tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId) return false;
  if (blockedTileKeys.has(simulationTileKey(x, y))) return false;
  // AFC dry-footprint rule: a precomputed site (possibly from a roster built
  // before this rule existed) next to water is skipped, not handed out.
  if (hasWaterNeighbor(terrainLookup(ctx), x, y)) return false;
  return !ctx.hasNearbySettled(x, y, FAIR_SPAWN_SITE_MIN_SETTLED_DISTANCE);
};

const terrainLookup = (ctx: RuntimeRespawnContext) => (x: number, y: number): DomainTileState["terrain"] | undefined =>
  ctx.tiles.get(simulationTileKey(x, y))?.terrain;

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

export const consumeRespawnNotice = (lastRespawnNoticeByPlayerId: Map<string, PlayerRespawnNotice>, playerId: string): PlayerRespawnNotice | undefined => {
  const notice = lastRespawnNoticeByPlayerId.get(playerId);
  lastRespawnNoticeByPlayerId.delete(playerId);
  return notice;
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
  ctx.emitEvent({
    eventType: "PLAYER_MESSAGE",
    commandId: `respawn-notice:${playerId}:${ctx.now()}`,
    playerId,
    messageType: "PLAYER_RESPAWNED",
    payloadJson: JSON.stringify({ reason: pending.reasonCode })
  });
};

export type RallySpawnOutcome = {
  spawn: { x: number; y: number };
  distance: number;
  withinRadius: boolean;
};

export const ensurePlayerHasSpawnTerritory = (
  ctx: RuntimeRespawnContext,
  playerId: string,
  rallyAnchor?: { x: number; y: number },
  onRallySpawnPlaced?: (outcome: RallySpawnOutcome) => void
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
  const spawn =
    ctx.claimFairSpawnSite(isSpawnableTile(ctx, blockedTileKeys), rallyAnchor) ??
    chooseLegacySpawnPlacement({
      playerId,
      tiles: ctx.tiles.values(),
      blockedTileKeys,
      coastalLandKeys: ctx.coastalLandKeys(),
      hasNearbySettled: ctx.hasNearbySettled,
      hasNearbyTown: ctx.hasNearbyTown,
      hasNearbyFood: ctx.hasNearbyFood,
      terrainAt: terrainLookup(ctx),
      hasNearbyBarbarian: (x, y, radius) => hasBarbarianWithin(ctx.tiles, x, y, radius),
      ...(rallyAnchor ? { rallyAnchor } : {})
    });
  if (!spawn) return false;
  const tileKey = simulationTileKey(spawn.x, spawn.y);
  const tile = ctx.tiles.get(tileKey);
  if (!tile || tile.terrain !== "LAND" || tile.ownerId) return false;
  // Automated Fabrication Complex (Phase 6, docs/manifest-tree-mapping-plan.md):
  // a House's opening tile is an AFC, not a SETTLEMENT-tier town. Its flat
  // baseline cap/regen/Coin contribution is added in runtime-manpower.ts and
  // the gold aggregation as a special case -- see the plan doc for why it is
  // NOT folded into the town-list-driven math.
  const spawnedTile: DomainTileState = {
    ...tile,
    ownerId: playerId,
    ownershipState: "SETTLED",
    afc: { ownerId: playerId, status: "active", activatedAt: ctx.now() }
  };
  const commandId = `bootstrap-spawn:${playerId}:${ctx.now()}`;
  const flattenedTiles = prepareAfcLandingFootprint(ctx, spawn.x, spawn.y, commandId);
  const clearedBarbarianTiles = clearBarbariansAroundAfcLanding(ctx, spawn.x, spawn.y, commandId);
  ctx.setTileYieldCollectedAt(commandId, playerId, tileKey, ctx.now());
  ctx.replaceTileState(tileKey, spawnedTile);
  finalizeRespawnNotice(ctx, playerId, tileKey);
  ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [spawnedTile, ...flattenedTiles, ...clearedBarbarianTiles].map((deltaTile) => ctx.tileDeltaFromState(deltaTile)) });
  ctx.emitPlayerStateUpdate({ commandId, playerId });
  if (rallyAnchor && onRallySpawnPlaced) {
    // Measured from where the player actually landed, so it also catches the fair-spawn-site claim (which picks
    // the nearest site with no radius cap) and not only the legacy search's random fallback.
    const distance = Math.max(Math.abs(spawn.x - rallyAnchor.x), Math.abs(spawn.y - rallyAnchor.y));
    onRallySpawnPlaced({ spawn: { x: spawn.x, y: spawn.y }, distance, withinRadius: distance <= RALLY_SPAWN_RADIUS });
  }
  return true;
};

// Migration for empires settled before Automated Fabrication Complexes
// existed (docs/manifest-afc-settlement-migration-plan.md): only a genuinely
// fresh spawn or a full elimination-respawn ever creates tile.afc (the three
// call sites above), so an already-settled empire from before that shipped
// never gets one on its own. This runs from the same per-connection hook as
// ensurePlayerHasSpawnTerritory (spawnAndAnnounce -> preparePlayerHandler),
// so a legacy player simply picks one up transparently on their next
// reconnect -- no bulk world-scan migration job, no separate "already
// migrated" flag to maintain (the ownedAfcTileKeys guard below makes every
// call after the first a fast no-op by construction). Unlike a genuine
// respawn, this grants no manpower/Coin floor and no respawn notice -- the
// player already has a running empire; this only backfills infrastructure.
export const ensurePlayerHasAfc = (ctx: RuntimeRespawnContext, playerId: string): boolean => {
  const player = ctx.players.get(playerId);
  if (!player) return false;
  const summary = ctx.summaryForPlayer(playerId);
  if (summary.territoryTileKeys.size === 0) return false; // ensurePlayerHasSpawnTerritory's path, not this one
  if (summary.ownedAfcTileKeys.size > 0) return false; // already has one
  // Same world-sanity guard as ensurePlayerHasSpawnTerritory: a genuine
  // zero here is only trustworthy once the world has actually loaded.
  if (ctx.tiles.size === 0) return false;
  // Anchor on any SETTLED tile the player owns, not specifically a town --
  // player-runtime-summary.ts tracks "SETTLED" and "has a town" as
  // independent conditions, so requiring a town would strand a player whose
  // only settled tile is e.g. a mine. Smallest tile key breaks ties
  // deterministically among multiple settled tiles.
  let anchor: { x: number; y: number } | undefined;
  let anchorKey = "";
  for (const tile of ctx.tiles.values()) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    const tileKey = simulationTileKey(tile.x, tile.y);
    if (!anchor || tileKey < anchorKey) {
      anchor = { x: tile.x, y: tile.y };
      anchorKey = tileKey;
    }
  }
  if (!anchor) return false; // no firmly-held (SETTLED) tile yet -- retry on a later connect
  // Also exclude ownerless FRONTIER tiles -- chooseLegacySpawnPlacement's
  // candidate filter only checks terrain/ownerId/town/dockId, so an
  // unowned-but-revealed FRONTIER tile (the very next tile any nearby empire
  // would organically expand into, via MARCH/EXPAND) would otherwise be
  // fair game. This migration is meant to purely backfill infrastructure,
  // never to race a live expansion for the same land.
  const frontierTileKeys = new Set<string>();
  for (const tile of ctx.tiles.values()) {
    if (!tile.ownerId && tile.ownershipState === "FRONTIER") frontierTileKeys.add(simulationTileKey(tile.x, tile.y));
  }
  const blockedTileKeys = new Set<string>([...ctx.pendingSettlementsByTile.keys(), ...ctx.locksByTile.keys(), ...frontierTileKeys]);
  const spawn = chooseLegacySpawnPlacement({
    playerId,
    tiles: ctx.tiles.values(),
    blockedTileKeys,
    coastalLandKeys: ctx.coastalLandKeys(),
    hasNearbySettled: ctx.hasNearbySettled,
    hasNearbyTown: ctx.hasNearbyTown,
    hasNearbyFood: ctx.hasNearbyFood,
    terrainAt: terrainLookup(ctx),
    rallyAnchor: anchor
  });
  if (!spawn) return false;
  const tileKey = simulationTileKey(spawn.x, spawn.y);
  const tile = ctx.tiles.get(tileKey);
  if (!tile || tile.terrain !== "LAND" || tile.ownerId) return false;
  const afcTile: DomainTileState = {
    ...tile,
    ownerId: playerId,
    ownershipState: "SETTLED",
    afc: { ownerId: playerId, status: "active", activatedAt: ctx.now() }
  };
  const commandId = `afc-migration:${playerId}:${ctx.now()}`;
  const flattenedTiles = prepareAfcLandingFootprint(ctx, spawn.x, spawn.y, commandId);
  ctx.setTileYieldCollectedAt(commandId, playerId, tileKey, ctx.now());
  ctx.replaceTileState(tileKey, afcTile, commandId);
  ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId, playerId, tileDeltas: [afcTile, ...flattenedTiles].map((deltaTile) => ctx.tileDeltaFromState(deltaTile)) });
  ctx.emitPlayerStateUpdate({ commandId, playerId });
  ctx.runtimeLogInfo(
    { type: "afc_migration_granted", playerId, commandId, tileKey, anchorTileKey: anchorKey },
    "granted migration AFC for reconnecting pre-AFC empire"
  );
  return true;
};

export const respawnPlayerOnUnownedLand = (ctx: RuntimeRespawnContext, playerId: string, commandId: string): boolean => {
  const actor = ctx.players.get(playerId);
  if (!actor) return false;
  if (!actor.isAi && !ctx.pendingRespawnNoticeByPlayerId.has(playerId)) preparePlayerRespawnNotice(ctx, playerId, "auth_recovery", commandId, { wasOnline: true });
  const blockedTileKeys = new Set<string>([...ctx.pendingSettlementsByTile.keys(), ...ctx.locksByTile.keys()]);
  const spawn =
    ctx.claimFairSpawnSite(isSpawnableTile(ctx, blockedTileKeys)) ??
    chooseLegacySpawnPlacement({
      playerId,
      tiles: ctx.tiles.values(),
      blockedTileKeys,
      coastalLandKeys: ctx.coastalLandKeys(),
      hasNearbySettled: ctx.hasNearbySettled,
      hasNearbyTown: ctx.hasNearbyTown,
      hasNearbyFood: ctx.hasNearbyFood,
      terrainAt: terrainLookup(ctx),
      hasNearbyBarbarian: (x, y, radius) => hasBarbarianWithin(ctx.tiles, x, y, radius)
    });
  if (!spawn) return false;
  const respawnedTileKey = simulationTileKey(spawn.x, spawn.y);
  const tile = ctx.tiles.get(respawnedTileKey);
  if (!tile || tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId) return false;
  // AFC replaces the SETTLEMENT-tier town on every spawn/respawn -- see the
  // comment in ensurePlayerHasSpawnTerritory above.
  const respawnedTile: DomainTileState = {
    ...tile,
    ownerId: playerId,
    ownershipState: "SETTLED",
    afc: { ownerId: playerId, status: "active", activatedAt: ctx.now() }
  };
  actor.manpower = Math.max(actor.manpower, 100);
  actor.points = Math.max(actor.points, ctx.respawnMinimumGold);
  const respawnCommandId = `${commandId}:respawn:${playerId}`;
  const flattenedTiles = prepareAfcLandingFootprint(ctx, spawn.x, spawn.y, respawnCommandId);
  const clearedBarbarianTiles = clearBarbariansAroundAfcLanding(ctx, spawn.x, spawn.y, respawnCommandId);
  ctx.setTileYieldCollectedAt(respawnCommandId, playerId, respawnedTileKey, ctx.now());
  ctx.replaceTileState(respawnedTileKey, respawnedTile, respawnCommandId);
  finalizeRespawnNotice(ctx, playerId, respawnedTileKey);
  ctx.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: respawnCommandId, playerId, tileDeltas: [respawnedTile, ...flattenedTiles, ...clearedBarbarianTiles].map((deltaTile) => ctx.tileDeltaFromState(deltaTile)) });
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
  const spawn =
    ctx.claimFairSpawnSite(isSpawnableTile(ctx, blockedTileKeys)) ??
    chooseLegacySpawnPlacement({
      playerId,
      tiles: ctx.tiles.values(),
      blockedTileKeys,
      coastalLandKeys: ctx.coastalLandKeys(),
      hasNearbySettled: ctx.hasNearbySettled,
      hasNearbyTown: ctx.hasNearbyTown,
      hasNearbyFood: ctx.hasNearbyFood,
      terrainAt: terrainLookup(ctx),
      hasNearbyBarbarian: (x, y, radius) => hasBarbarianWithin(ctx.tiles, x, y, radius)
    });
  if (!spawn) return;
  const respawnedTileKey = simulationTileKey(spawn.x, spawn.y);
  const tile = ctx.tiles.get(respawnedTileKey);
  if (!tile || tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId) return;
  // AFC replaces the SETTLEMENT-tier town on every spawn/respawn -- see the
  // comment in ensurePlayerHasSpawnTerritory above.
  const respawnedTile: DomainTileState = {
    ...tile,
    ownerId: playerId,
    ownershipState: "SETTLED",
    afc: { ownerId: playerId, status: "active", activatedAt: ctx.now() }
  };
  actor.manpower = Math.max(actor.manpower, 100);
  actor.points = Math.max(actor.points, ctx.respawnMinimumGold);
  const respawnCommandId = `${commandId}:respawn:${playerId}`;
  const flattenedTiles = prepareAfcLandingFootprint(ctx, spawn.x, spawn.y, respawnCommandId);
  const clearedBarbarianTiles = clearBarbariansAroundAfcLanding(ctx, spawn.x, spawn.y, respawnCommandId);
  ctx.setTileYieldCollectedAt(respawnCommandId, playerId, respawnedTileKey, ctx.now());
  ctx.replaceTileState(respawnedTileKey, respawnedTile, respawnCommandId);
  finalizeRespawnNotice(ctx, playerId, respawnedTileKey);
  ctx.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: respawnCommandId,
    playerId,
    tileDeltas: [respawnedTile, ...flattenedTiles, ...clearedBarbarianTiles].map((deltaTile) => ctx.tileDeltaFromState(deltaTile))
  });
  if (!actor.isAi) ctx.emitPlayerStateUpdate({ commandId: respawnCommandId, playerId });
};

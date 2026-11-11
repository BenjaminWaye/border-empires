import { TOWN_REACH_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, isAfcFootprintClear, wrapX, wrapY, type PlayerRespawnNotice, type PlayerRespawnReasonCode } from "@border-empires/shared";
import { STARTING_CAPITAL_MANPOWER_CAP, TOWN_MANPOWER_BY_TIER, starterSiteQuality, type DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { buildRewritePlayerRespawnNotice, type PendingRespawnNoticeContext } from "./player-respawn-notice.js";
import { chooseLegacySpawnPlacement, RALLY_SPAWN_RADIUS, type LegacySpawnPlacementInput } from "./spawn-placement/spawn-placement.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { hasBarbarianWithin } from "./spawn-placement/barbarian-proximity.js";
import type { SpawnSearchLookups } from "./spawn-placement/spawn-placement-index.js";
import { prepareAfcLandingFootprint } from "./afc-landing-footprint/afc-landing-footprint.js";
import { clearBarbariansAroundAfcLanding } from "./afc-landing-footprint/afc-landing-barbarian-clear.js";
import { backfillMissingHouseModules, rebalanceOverfullAfcs } from "./afc-module-commissioning.js";
import { createHumanRuntimePlayer } from "./runtime-player-factory.js";
import { createEmptyPlayerRuntimeSummary, type PlayerRuntimeSummary } from "./player-runtime-summary.js";
import type { RuntimePlayer, SimulationTileWireDelta } from "./runtime-types.js";
import type { CombatLockTileReader } from "./combat-lock-index/combat-lock-index.js";

export type RuntimeRespawnContext = SpawnSearchLookups & {
  afcGlobalLosses?: () => number;
  afcUpgradeRuleset?: "afc-v1" | undefined;
  now: () => number;
  players: Map<string, RuntimePlayer>;
  tiles: Map<string, DomainTileState>;
  playerSummaries: Map<string, PlayerRuntimeSummary>;
  plannerPlayerTileCollectionVersionByPlayer: Map<string, number>;
  pendingRespawnNoticeByPlayerId: Map<string, PendingRespawnNoticeContext>;
  lastRespawnNoticeByPlayerId: Map<string, PlayerRespawnNotice>;
  pendingSettlementsByTile: ReadonlyMap<string, unknown>;
  locksByTile: CombatLockTileReader;
  rememberedAutomationVictoryPathByPlayer: Map<string, unknown>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  /** Invalidates terrain-derived caches after the AFC landing flattens mountains (same as REMOVE_MOUNTAIN). */
  bumpTerrainEpoch: () => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  emitPlayerStateUpdate: (command: { commandId: string; playerId: string }) => void;
  scheduleAfter: (delayMs: number, task: () => void) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
  incomePerMinuteForPlayer: (playerId: string) => number;
  respawnMinimumGold: number;
  playerManpowerCap?: (player: RuntimePlayer) => number;
  incrementAuthRecoveryRespawn: () => void;
  incrementAuthRecoveryRespawnGuarded: () => void;
  /** Grants the one-time landing reserve (base + late-join catch-up) a respawned empire lands with, same as a brand-new one. */
  grantLandingReserve?: (player: RuntimePlayer) => void;
};

// Keep an opening buffer without rejecting good food/town routes merely
// because an empire exists somewhere in a 100-tile-wide square.
const FAIR_SPAWN_SITE_MIN_SETTLED_DISTANCE = 10;

const isSpawnableTile = (ctx: RuntimeRespawnContext, blockedTileKeys: ReadonlySet<string>) => (x: number, y: number): boolean => {
  const tile = ctx.tiles.get(simulationTileKey(x, y));
  if (!tile || tile.terrain !== "LAND" || tile.ownerId || tile.town || tile.dockId) return false;
  if (blockedTileKeys.has(simulationTileKey(x, y))) return false;
  // Recheck the dry, unobstructed footprint against live tiles before using a roster site.
  if (!isAfcFootprintClear((nx, ny) => ctx.tiles.get(simulationTileKey(nx, ny)), x, y)) return false;
  // A neutral tile can already belong to a rival's reach. The AFC's opening
  // disk must be uncontested, otherwise nearby neutral goals cannot be claimed.
  for (let dy = -TOWN_REACH_RADIUS; dy <= TOWN_REACH_RADIUS; dy += 1) {
    for (let dx = -TOWN_REACH_RADIUS; dx <= TOWN_REACH_RADIUS; dx += 1) if (ctx.reachOwnerAt(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT))) return false;
  }
  return !ctx.hasNearbySettled(x, y, FAIR_SPAWN_SITE_MIN_SETTLED_DISTANCE) && Boolean(starterSiteQuality(ctx.tiles, x, y, WORLD_WIDTH, WORLD_HEIGHT, (nx, ny) => !blockedTileKeys.has(simulationTileKey(nx, ny)) && !ctx.reachOwnerAt(nx, ny)));
};

const terrainLookup = (ctx: RuntimeRespawnContext) => (x: number, y: number): DomainTileState["terrain"] | undefined =>
  ctx.tiles.get(simulationTileKey(x, y))?.terrain;

// The one input shape every spawn/respawn path hands chooseLegacySpawnPlacement.
const legacySpawnSearchInput = (
  ctx: RuntimeRespawnContext,
  playerId: string,
  blockedTileKeys: ReadonlySet<string>,
  rallyAnchor?: { x: number; y: number }
): LegacySpawnPlacementInput => ({
  playerId,
  tiles: ctx.tiles.values(),
  blockedTileKeys,
  coastalLandKeys: ctx.coastalLandKeys(),
  hasNearbySettled: ctx.hasNearbySettled,
  hasNearbyTown: ctx.hasNearbyTown,
  hasNearbyFood: ctx.hasNearbyFood,
  terrainAt: terrainLookup(ctx),
  hasNearbyBarbarian: (x, y, radius) => hasBarbarianWithin(ctx.tiles, x, y, radius),
  reachOwnerAt: ctx.reachOwnerAt,
  onRivalReachRelaxed: () =>
    ctx.runtimeLogInfo(
      { type: "spawn_map_nearly_full", playerId, rallyAnchor: rallyAnchor ?? null },
      "spawn map nearly full: no open ground clear of rival reach, spawning inside it"
    ),
  ...(rallyAnchor ? { rallyAnchor } : {})
});

const chooseStarterSpawn = (
  ctx: RuntimeRespawnContext, playerId: string, blockedTileKeys: ReadonlySet<string>, rallyAnchor?: { x: number; y: number }
): { x: number; y: number } | undefined => {
  const fair = ctx.claimFairSpawnSite(isSpawnableTile(ctx, blockedTileKeys), rallyAnchor);
  const spawn = fair ?? chooseLegacySpawnPlacement(legacySpawnSearchInput(ctx, playerId, blockedTileKeys, rallyAnchor));
  if (spawn) {
    const quality = starterSiteQuality(ctx.tiles, spawn.x, spawn.y, WORLD_WIDTH, WORLD_HEIGHT, (x, y) => !blockedTileKeys.has(simulationTileKey(x, y)) && !ctx.reachOwnerAt(x, y));
    ctx.runtimeLogInfo({ type: "starter_spawn_placed", playerId, source: fair ? "qualified_roster" : "fallback", x: spawn.x, y: spawn.y, qualified: Boolean(quality), ...quality }, "starter spawn quality");
  }
  return spawn;
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
    if (ctx.afcUpgradeRuleset) player.afcUpgradeRuleset = ctx.afcUpgradeRuleset;
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
  const spawn = chooseStarterSpawn(ctx, playerId, blockedTileKeys, rallyAnchor);
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
    afc: { ownerId: playerId, status: "active", activatedAt: ctx.now(), landedAt: ctx.now() }
  };
  const commandId = `bootstrap-spawn:${playerId}:${ctx.now()}`;
  const flattenedTiles = prepareAfcLandingFootprint(ctx, spawn.x, spawn.y, commandId);
  const clearedBarbarianTiles = clearBarbariansAroundAfcLanding(ctx, spawn.x, spawn.y, commandId);
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

// Infrastructure repair never manufactures an AFC. Humans and AI must commission one.
export const ensurePlayerHasAfc = (ctx: RuntimeRespawnContext, playerId: string): boolean => {
  const player = ctx.players.get(playerId);
  if (player) {
    const state = player.afcRecovery ??= { globalLosses: ctx.afcGlobalLosses?.() ?? 0 };
    state.globalLosses = ctx.afcGlobalLosses?.() ?? state.globalLosses;
    if (ctx.summaryForPlayer(playerId).controlledAfcCount === 0 && ctx.summaryForPlayer(playerId).territoryTileKeys.size > 0) state.requiredSince ??= ctx.now();
  }
  return backfillHouseModules(ctx, playerId);
};

// Also moves House copies off an AFC still holding more than AFC_MODULE_SLOTS
// from before the cap existed (rebalanceOverfullAfcs).
const backfillHouseModules = (ctx: RuntimeRespawnContext, playerId: string): boolean => {
  const techIds = ctx.players.get(playerId)?.techIds;
  const delivery = { ...ctx, ownedAfcTileKeys: (id: string) => ctx.summaryForPlayer(id).ownedAfcTileKeys };
  const commandId = `afc-module-backfill:${playerId}:${ctx.now()}`;
  const rebalanced = rebalanceOverfullAfcs(ctx, delivery, playerId, commandId);
  const backfilled = techIds ? backfillMissingHouseModules(ctx, delivery, playerId, techIds, commandId) : false;
  return rebalanced || backfilled;
};

// Recovery may establish a foothold only for an empire with no surviving land.
// A failed town relocation must never manufacture a replacement AFC for an existing empire.
export const respawnPlayerOnUnownedLand = (ctx: RuntimeRespawnContext, playerId: string, commandId: string): boolean => {
  const actor = ctx.players.get(playerId);
  if (!actor || ctx.summaryForPlayer(playerId).territoryTileKeys.size > 0) return false;
  if (!actor.isAi && !ctx.pendingRespawnNoticeByPlayerId.has(playerId)) preparePlayerRespawnNotice(ctx, playerId, "auth_recovery", commandId, { wasOnline: true });
  const blockedTileKeys = new Set<string>([...ctx.pendingSettlementsByTile.keys(), ...ctx.locksByTile.keys()]);
  const spawn = chooseStarterSpawn(ctx, playerId, blockedTileKeys);
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
    afc: { ownerId: playerId, status: "active", activatedAt: ctx.now(), landedAt: ctx.now() }
  };
  actor.manpower = Math.max(actor.manpower, STARTING_CAPITAL_MANPOWER_CAP);
  actor.points = Math.max(actor.points, ctx.respawnMinimumGold);
  const respawnCommandId = `${commandId}:respawn:${playerId}`;
  const flattenedTiles = prepareAfcLandingFootprint(ctx, spawn.x, spawn.y, respawnCommandId);
  const clearedBarbarianTiles = clearBarbariansAroundAfcLanding(ctx, spawn.x, spawn.y, respawnCommandId);
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
  // Holding ground: commission a replacement or explicitly withdraw.
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
  const spawn = chooseStarterSpawn(ctx, playerId, blockedTileKeys);
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
    afc: { ownerId: playerId, status: "active", activatedAt: ctx.now(), landedAt: ctx.now() }
  };
  actor.manpower = Math.max(actor.manpower, STARTING_CAPITAL_MANPOWER_CAP);
  ctx.grantLandingReserve?.(actor);
  const landingManpower = actor.manpower;
  actor.points = Math.max(actor.points, ctx.respawnMinimumGold);
  const respawnCommandId = `${commandId}:respawn:${playerId}`;
  const flattenedTiles = prepareAfcLandingFootprint(ctx, spawn.x, spawn.y, respawnCommandId);
  const clearedBarbarianTiles = clearBarbariansAroundAfcLanding(ctx, spawn.x, spawn.y, respawnCommandId);
  ctx.replaceTileState(respawnedTileKey, respawnedTile, respawnCommandId);
  // Tile/reach callbacks may refresh capacity while the landing is written.
  // An opening package includes the AFC baseline once, never another starting-capital refill.
  actor.manpower = landingManpower + (ctx.playerManpowerCap ? TOWN_MANPOWER_BY_TIER.SETTLEMENT.cap : 0);
  actor.manpowerCapSnapshot = ctx.playerManpowerCap?.(actor) ?? STARTING_CAPITAL_MANPOWER_CAP + TOWN_MANPOWER_BY_TIER.SETTLEMENT.cap;
  finalizeRespawnNotice(ctx, playerId, respawnedTileKey);
  ctx.emitEvent({
    eventType: "TILE_DELTA_BATCH",
    commandId: respawnCommandId,
    playerId,
    tileDeltas: [respawnedTile, ...flattenedTiles, ...clearedBarbarianTiles].map((deltaTile) => ctx.tileDeltaFromState(deltaTile))
  });
  if (!actor.isAi) ctx.emitPlayerStateUpdate({ commandId: respawnCommandId, playerId });
};

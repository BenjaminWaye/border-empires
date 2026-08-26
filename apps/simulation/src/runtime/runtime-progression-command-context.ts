import type { DomainTileState } from "@border-empires/game-domain";
import { maintainTownConnectivityForTileChange, type TownConnectivityState } from "../economy-network/town-connectivity-incremental.js";
import { flushRadiusYieldRefresh } from "../radius-yield-refresh/radius-yield-refresh.js";
import { reconcileOutpostVisionBonus, resyncPlayerOutpostVisionBonuses, type OutpostVisionCoverageDeps } from "../runtime-outpost-vision.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import { mapTile } from "../runtime-snapshot-sections.js";
import type { RuntimePlayer, SimulationTileWireDelta } from "../runtime-types.js";
import { reconcileTownVisionBonus, resyncPlayerTownVisionBonuses } from "../runtime-town-vision.js";
import type { RuntimeProgressionCommandContext } from "../runtime-progression-command-handlers.js";
import { tileResourceMatchesRevealCategory } from "../tech-domain-bridge/tech-domain-bridge.js";
import type { VisibilityCoverageTracker, VisibilityTransitionCallbacks } from "../visibility-coverage-cache.js";

/**
 * Raw runtime resources the progression command context (UPGRADE_TOWN_TIER,
 * COLLECT_SHARD, CHOOSE_TECH, CHOOSE_DOMAIN) needs. This is the "port" the
 * SimulationRuntime composition root fills in with `this.*` closures — see
 * `progressionCommandContext()` in runtime.ts.
 */
export interface ProgressionCommandContextDeps {
  readonly players: Map<string, RuntimePlayer>;
  readonly tiles: Map<string, DomainTileState>;
  readonly emitEvent: RuntimeProgressionCommandContext["emitEvent"];
  readonly emitPlayerStateUpdate: RuntimeProgressionCommandContext["emitPlayerStateUpdate"];
  readonly addStrategicResource: RuntimeProgressionCommandContext["addStrategicResource"];
  readonly tileDeltaFromState: RuntimeProgressionCommandContext["tileDeltaFromState"];
  readonly replaceTileState: RuntimeProgressionCommandContext["replaceTileState"];
  readonly snapshotTileCache: Map<string, DomainTileState>;
  readonly townConnectivityStateByPlayer: Map<string, TownConnectivityState>;
  readonly dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  readonly settledTilesForPlayer: (playerId: string) => readonly DomainTileState[];
  readonly outpostVisionDeps: () => OutpostVisionCoverageDeps;
  readonly visibilityCoverage: VisibilityCoverageTracker;
  readonly visionTransitionCallbacks: VisibilityTransitionCallbacks;
  readonly now: () => number;
  readonly invalidateTileStringifyCache: (tileKey: string) => void;
  readonly summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  readonly economySnapshotCacheByPlayer: Map<string, unknown>;
  readonly resourceSlotDemandCacheByPlayer: Map<string, unknown>;
  readonly resourceSlotDormancyCacheByPlayer: Map<string, unknown>;
  readonly tileYieldContextCacheByPlayer: Map<string, unknown>;
  readonly townNetworkCacheByPlayer: Map<string, unknown>;
  readonly manpowerStructureBonusCacheByPlayer: Map<string, unknown>;
  readonly upkeepAccrualCacheByPlayer: Map<string, unknown>;
  readonly ownedOutpostTilesForPlayer: (playerId: string) => DomainTileState[];
  readonly incomePerMinuteForPlayer: RuntimeProgressionCommandContext["incomePerMinuteForPlayer"];
  readonly decrementShardRainSiteCount: () => number;
  readonly clearShardRainExpiry: () => void;
  readonly clearLastShardRainHello: () => void;
  readonly onShardCollected: (() => void) | undefined;
  readonly resourceSlotSupplyForPlayer: RuntimeProgressionCommandContext["resourceSlotSupplyForPlayer"];
  readonly resourceSlotDemandForPlayer: RuntimeProgressionCommandContext["resourceSlotDemandForPlayer"];
  readonly tileDeltaRevealOnly: (tile: DomainTileState, playerId?: string) => SimulationTileWireDelta;
}

export function buildProgressionCommandContext(deps: ProgressionCommandContextDeps): RuntimeProgressionCommandContext {
  return {
    players: deps.players,
    tiles: deps.tiles,
    emitEvent: (event) => deps.emitEvent(event),
    emitPlayerStateUpdate: (command, playerId) => deps.emitPlayerStateUpdate(command, playerId),
    addStrategicResource: (player, resource, amount) => deps.addStrategicResource(player, resource, amount),
    tileDeltaFromState: (tile) => deps.tileDeltaFromState(tile),
    replaceTileState: (tileKey, tile, commandId) => deps.replaceTileState(tileKey, tile, commandId),
    setTileState: (tileKey, tile) => {
      const previous = deps.tiles.get(tileKey);
      deps.tiles.set(tileKey, tile); deps.snapshotTileCache.set(tileKey, mapTile(tile));
      // This path deliberately skips refreshEconomyCachesForTileChange (the
      // progression handlers invalidate the economy caches themselves), but
      // the corridor union-find still has to be maintained: UPGRADE_TOWN_TIER
      // crossing the SETTLEMENT boundary turns a corridor tile into a
      // connectivity barrier, and leaving the structure merged across it
      // inflates connectedTownCount for towns on either side.
      maintainTownConnectivityForTileChange(deps.townConnectivityStateByPlayer, tileKey, previous, tile);
      flushRadiusYieldRefresh({ tileKey, previous, next: tile, tiles: deps.tiles, dockLinksByDockTileKey: deps.dockLinksByDockTileKey, settledTilesForPlayer: (p) => deps.settledTilesForPlayer(p), tileDeltaFromState: (t) => deps.tileDeltaFromState(t), emitEvent: (e) => deps.emitEvent(e), now: () => deps.now() });
      reconcileTownVisionBonus({ players: deps.players, coverage: deps.visibilityCoverage, callbacks: deps.visionTransitionCallbacks }, previous, tile);
      reconcileOutpostVisionBonus(deps.outpostVisionDeps(), previous, tile);
    },
    invalidateTileStringifyCache: (tileKey) => deps.invalidateTileStringifyCache(tileKey),
    summaryForPlayer: (playerId) => deps.summaryForPlayer(playerId),
    invalidateEconomySnapshot: (playerId) => {
      deps.economySnapshotCacheByPlayer.delete(playerId);
      // UPGRADE_TOWN_TIER changes the town's FOOD slot demand
      // (townFoodSlotDemandForTier) — this setTileState path skips
      // refreshEconomyCachesForTileChange (see its own comment above), so
      // the resource-slot caches need invalidating here instead.
      deps.resourceSlotDemandCacheByPlayer.delete(playerId);
      deps.resourceSlotDormancyCacheByPlayer.delete(playerId);
    },
    invalidateTileYieldContext: (playerId) => {
      deps.tileYieldContextCacheByPlayer.delete(playerId);
      // UPGRADE_TOWN_TIER can move a town across the SETTLEMENT boundary,
      // which now changes graph membership in buildConnectedTownNetworkForPlayer
      // (settlements are excluded) — the cached network must be rebuilt too,
      // not just the yield context that wraps it.
      deps.townNetworkCacheByPlayer.delete(playerId);
      deps.manpowerStructureBonusCacheByPlayer.delete(playerId);
    },
    invalidateUpkeepAccrual: (playerId) => deps.upkeepAccrualCacheByPlayer.delete(playerId),
    resyncVisionRadius: (playerId) => {
      deps.visibilityCoverage.resyncVisionRadius(playerId, deps.visionTransitionCallbacks);
      // A base-radius change also moves every owned town's +1 reveal ring.
      resyncPlayerTownVisionBonuses({ players: deps.players, coverage: deps.visibilityCoverage, callbacks: deps.visionTransitionCallbacks }, playerId, deps.summaryForPlayer(playerId).ownedTownTierByTile);
      // A tech unlock (e.g. Survey Corps) can also move every owned outpost's
      // ring — and since applyOutpostVisionBonusForTile is dormancy-aware,
      // this also doubles as the dormancy resync for a slot-waiver change
      // (§23.2) or a townFoodSlotDemandForTier bump (UPGRADE_TOWN_TIER).
      resyncPlayerOutpostVisionBonuses(deps.outpostVisionDeps(), playerId, deps.ownedOutpostTilesForPlayer(playerId));
    },
    incomePerMinuteForPlayer: (playerId) => deps.incomePerMinuteForPlayer(playerId),
    decrementShardRainSiteCount: () => deps.decrementShardRainSiteCount(),
    clearShardRainExpiry: () => deps.clearShardRainExpiry(),
    clearLastShardRainHello: () => deps.clearLastShardRainHello(),
    onShardCollected: deps.onShardCollected,
    resourceSlotSupplyForPlayer: (playerId) => deps.resourceSlotSupplyForPlayer(playerId),
    resourceSlotDemandForPlayer: (playerId) => deps.resourceSlotDemandForPlayer(playerId),
    // §23.2: a tech/domain choice can change slot waivers, which the
    // tile-mutation-only cache invalidation below doesn't catch.
    invalidateResourceSlotDemand: (playerId) => {
      deps.resourceSlotDemandCacheByPlayer.delete(playerId); deps.resourceSlotDormancyCacheByPlayer.delete(playerId);
    },
    resyncRevealedResourceTilesForPlayer: (playerId, category) => {
      const tileDeltas: SimulationTileWireDelta[] = [];
      deps.visibilityCoverage.forEachVisibleKey(playerId, (tileKey) => {
        const tile = deps.tiles.get(tileKey);
        if (tile?.resource && tileResourceMatchesRevealCategory(tile.resource, category)) {
          tileDeltas.push(deps.tileDeltaRevealOnly(tile, playerId));
        }
      });
      if (tileDeltas.length > 0) {
        deps.emitEvent({ eventType: "TILE_DELTA_BATCH", commandId: `tech-reveal:${category}:${playerId}`, playerId, tileDeltas });
      }
    }
  };
}

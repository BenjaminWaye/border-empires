// Stage 4 town network/connectivity extraction out of runtime.ts (see
// AGENTS.md / docs/agents/topic-runbooks.md for the god-class breakup plan).
// These are pure relocations of existing runtime.ts method bodies into free
// functions that take their dependencies explicitly via
// RuntimeTownNetworkContext, mirroring the build*CommandContext pattern used
// in Stage 1-3. No behavior was changed — only moved.
//
// The townNetworkCacheByPlayer, townConnectivityStateByPlayer, and
// tileYieldContextCacheByPlayer Maps stay owned (as `this.*` fields) by
// SimulationRuntime and are threaded in via the context, exactly like Stage
// 3's runtime-economy.ts — they are invalidated from other call sites in
// runtime.ts (init/rehydrate, tickPopulationGrowth) and from
// refreshEconomyCachesForTileChange / runtime-progression-command-context.ts
// which read/mutate them directly, so ownership must not move here.
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { QUARTERMASTERS_OFFICE_RADIUS } from "@border-empires/game-domain";
import {
  buildConnectedTownNetworkForPlayer,
  enrichTownWithConnectedNetwork,
  firstThreeTownKeysForPlayer,
  firstThreeTownsGoldOutputMultiplierForPlayer,
  railDepotAlreadyInNetwork,
  assemblyWorksAlreadyInNetwork,
  censusHallConnectedGranaryCountForPlayer,
  type ConnectedTownNetworkEntry
} from "../economy-network/economy-network.js";
import {
  buildFedTownKeys,
  refreshTownEconomyFields
} from "../player-update-economy/player-update-economy.js";
import { createTownConnectivityState, type TownConnectivityState } from "../economy-network/town-connectivity-incremental.js";
import { radiusStructureKeysForSettledTiles } from "../tile-yield-view/tile-yield-view.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { RuntimePlayer, RuntimeTileYieldEconomyContext } from "../runtime-types.js";
import type { MainThreadTaskTracker } from "../main-thread-task-tracker/main-thread-task-tracker.js";

export interface RuntimeTownNetworkContext {
  tiles: Map<string, DomainTileState>;
  townNetworkCacheByPlayer: Map<string, Map<string, ConnectedTownNetworkEntry>>;
  townConnectivityStateByPlayer: Map<string, TownConnectivityState>;
  tileYieldContextCacheByPlayer: Map<string, RuntimeTileYieldEconomyContext>;
  quartermastersOfficeTilesByOwner: Map<string, Set<string>>;
  trackSyncMainThreadTask?: MainThreadTaskTracker["trackSync"];
  players: Map<string, RuntimePlayer>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  settledTilesForPlayer: (playerId: string) => DomainTileState[];
  foodDormantTownKeysForPlayer: (playerId: string) => ReadonlySet<string>;
  dormantEconomicStructureKeysForPlayer: (playerId: string) => ReadonlySet<string>;
}

export function orderedTownTilesForPlayer(ctx: RuntimeTownNetworkContext, playerId: string): DomainTileState[] {
  return [...ctx.summaryForPlayer(playerId).ownedTownTierByTile.keys()]
    .map((tileKey) => ctx.tiles.get(tileKey))
    .filter((tile): tile is DomainTileState => Boolean(tile?.town && tile.ownerId === playerId && tile.ownershipState === "SETTLED"));
}

export function fedTownKeysForPlayer(ctx: RuntimeTownNetworkContext, player: DomainPlayer): Set<string> {
  const summary = ctx.summaryForPlayer(player.id);
  return buildFedTownKeys(player.id, summary, ctx.tiles, ctx.foodDormantTownKeysForPlayer(player.id));
}

// Shared with cachedEconomySnapshot so buildConnectedTownNetworkForPlayer
// (O(settled_tiles + towns^2)) fires once per cache-miss cycle, not twice.
export function cachedTownNetworkForPlayer(
  ctx: RuntimeTownNetworkContext,
  player: DomainPlayer,
  settledTiles: readonly DomainTileState[],
  maxConnectedTownNames: number
): Map<string, ConnectedTownNetworkEntry> {
  const cached = ctx.townNetworkCacheByPlayer.get(player.id);
  if (cached) return cached;
  const rebuild = (): Map<string, ConnectedTownNetworkEntry> => {
    let incrementalState = ctx.townConnectivityStateByPlayer.get(player.id);
    if (!incrementalState) {
      incrementalState = createTownConnectivityState();
      ctx.townConnectivityStateByPlayer.set(player.id, incrementalState);
    }
    const network = buildConnectedTownNetworkForPlayer(player, ctx.tiles, settledTiles, {
      maxConnectedTownNames,
      incrementalState,
      dormantEconomicStructureKeys: ctx.dormantEconomicStructureKeysForPlayer(player.id)
    });
    ctx.townNetworkCacheByPlayer.set(player.id, network);
    return network;
  };
  return ctx.trackSyncMainThreadTask
    ? ctx.trackSyncMainThreadTask("town_network_rebuild", { playerId: player.id }, rebuild)
    : rebuild();
}

// Same rebuild as cachedTownNetworkForPlayer, without the
// trackSyncMainThreadTask wrapper — see cachedManpowerStructureBonusForPlayer
// (runtime-manpower-structure-bonus.ts) for why an uninstrumented path is
// needed here.
export function rebuildTownNetworkUninstrumented(
  ctx: RuntimeTownNetworkContext,
  player: DomainPlayer,
  settledTiles: readonly DomainTileState[]
): Map<string, ConnectedTownNetworkEntry> {
  let incrementalState = ctx.townConnectivityStateByPlayer.get(player.id);
  if (!incrementalState) {
    incrementalState = createTownConnectivityState();
    ctx.townConnectivityStateByPlayer.set(player.id, incrementalState);
  }
  const network = buildConnectedTownNetworkForPlayer(player, ctx.tiles, settledTiles, {
    maxConnectedTownNames: 0,
    incrementalState,
    dormantEconomicStructureKeys: ctx.dormantEconomicStructureKeysForPlayer(player.id)
  });
  ctx.townNetworkCacheByPlayer.set(player.id, network);
  return network;
}

// §4.4: "only one Rail Depot may be built per connected-town network" —
// checked at build time (see resolveTownSupportTarget in
// runtime-structure-command-handlers.ts).
export function railDepotAlreadyInNetworkForPlayer(ctx: RuntimeTownNetworkContext, playerId: string, townKey: string): boolean {
  const player = ctx.players.get(playerId);
  if (!player) return false;
  const settledTiles = ctx.settledTilesForPlayer(playerId);
  const townNetwork = cachedTownNetworkForPlayer(ctx, player, settledTiles, 0);
  return railDepotAlreadyInNetwork(playerId, townKey, ctx.tiles, townNetwork);
}

// Assembly Works (tech-tree redesign): "only one Assembly Works may be
// built per connected-town network" — mirrors railDepotAlreadyInNetworkForPlayer
// exactly, retargeted.
export function assemblyWorksAlreadyInNetworkForPlayer(ctx: RuntimeTownNetworkContext, playerId: string, townKey: string): boolean {
  const player = ctx.players.get(playerId);
  if (!player) return false;
  const settledTiles = ctx.settledTilesForPlayer(playerId);
  const townNetwork = cachedTownNetworkForPlayer(ctx, player, settledTiles, 0);
  return assemblyWorksAlreadyInNetwork(playerId, townKey, ctx.tiles, townNetwork);
}

// Quartermaster's Office (tech-tree redesign): true when the player owns
// an active Quartermaster's Office within QUARTERMASTERS_OFFICE_RADIUS
// (Chebyshev) tiles of (x, y). A plain radius scan over the player's own
// (rare, late-game) Quartermaster's Offices, same cost tradeoff as
// monumentClaimOwnerId's full scan -- this only runs on a War-branch
// structure build/upgrade command, not every tick.
export function hasNearbyQuartermastersOfficeForPlayer(ctx: RuntimeTownNetworkContext, playerId: string, x: number, y: number): boolean {
  const keys = ctx.quartermastersOfficeTilesByOwner.get(playerId);
  if (!keys || keys.size === 0) return false;
  for (const key of keys) {
    const tile = ctx.tiles.get(key);
    if (!tile || tile.economicStructure?.status !== "active") continue;
    if (Math.max(Math.abs(tile.x - x), Math.abs(tile.y - y)) <= QUARTERMASTERS_OFFICE_RADIUS) return true;
  }
  return false;
}

// Census Hall (tech-tree redesign): connected-network Incubation Engine
// (Granary) count, for the +20,000 population per connected city bonus.
export function censusHallConnectedGranaryBonusCountForPlayer(ctx: RuntimeTownNetworkContext, playerId: string, townKey: string): number {
  const player = ctx.players.get(playerId);
  if (!player) return 0;
  const settledTiles = ctx.settledTilesForPlayer(playerId);
  const townNetwork = cachedTownNetworkForPlayer(ctx, player, settledTiles, 0);
  return censusHallConnectedGranaryCountForPlayer(playerId, ctx.tiles, townNetwork, townKey, ctx.dormantEconomicStructureKeysForPlayer(playerId));
}

export function tileYieldEconomyContextForPlayer(ctx: RuntimeTownNetworkContext, player: DomainPlayer): RuntimeTileYieldEconomyContext {
  const cached = ctx.tileYieldContextCacheByPlayer.get(player.id);
  if (cached) return cached;
  const rebuild = (): RuntimeTileYieldEconomyContext => {
    const settledTiles = ctx.settledTilesForPlayer(player.id);
    const { waterworksKeys, foundryKeys } = radiusStructureKeysForSettledTiles(settledTiles);
    const context: RuntimeTileYieldEconomyContext = {
      player,
      townNetwork: cachedTownNetworkForPlayer(ctx, player, settledTiles, 16),
      fedTownKeys: fedTownKeysForPlayer(ctx, player),
      // Skip expensive first-three-town key computation if the player has no
      // domain granting firstThreeTownsGoldOutputMult — multiplier is 1.0 so
      // the key set has no effect. Skips O(towns) sort for most players.
      firstThreeTownKeys: firstThreeTownsGoldOutputMultiplierForPlayer(player) !== 1
        ? firstThreeTownKeysForPlayer(player.id, orderedTownTilesForPlayer(ctx, player.id).map(t => [`${t.x},${t.y}`, t.town?.populationTier] as const))
        : new Set<string>(),
      waterworksKeys,
      foundryKeys,
      dormantEconomicStructureKeys: ctx.dormantEconomicStructureKeysForPlayer(player.id)
    };
    ctx.tileYieldContextCacheByPlayer.set(player.id, context);
    return context;
  };
  // Attribution for event_loop_blocked (was empty mainThreadTasks): rebuild
  // is buildConnectedTownNetworkForPlayer's O(settled_tiles + towns²) BFS.
  return ctx.trackSyncMainThreadTask
    ? ctx.trackSyncMainThreadTask("tile_yield_economy_context_rebuild", { playerId: player.id }, rebuild)
    : rebuild();
}

export function enrichTileWithTownContext(
  tile: DomainTileState,
  player: RuntimePlayer | undefined,
  context: RuntimeTileYieldEconomyContext,
  tiles: Map<string, DomainTileState>
): DomainTileState {
  if (!tile.town) return tile;
  const networkTown = enrichTownWithConnectedNetwork(tile, context.townNetwork);
  const tileKey = `${tile.x},${tile.y}`;
  const refreshedTown = networkTown && player
    ? refreshTownEconomyFields(
        networkTown,
        tile,
        player,
        tiles,
        context.fedTownKeys,
        context.firstThreeTownKeys,
        context.townNetwork?.get(tileKey)?.connectedClearingHouseKeys,
        context.dormantEconomicStructureKeys
      )
    : networkTown;
  return { ...tile, town: refreshedTown };
}

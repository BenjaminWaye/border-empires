import type { DomainTileState } from "@border-empires/game-domain";
import { buildTileYieldView, tileYieldNeedsServerAuthority } from "./tile-yield-view/tile-yield-view.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { TileDeltaStringifyCache } from "./tile-delta-stringify-cache/tile-delta-stringify-cache.js";
import type { RuntimePlayer, RuntimeTileYieldEconomyContext, SimulationTileWireDelta } from "./runtime-types.js";
import { overlayJsonFieldsFrom } from "./tile-delta-overlay-fields.js";

export type TileDeltaFromStateDeps = {
  players: Map<string, RuntimePlayer>;
  tileDeltaStringifyCache: TileDeltaStringifyCache;
  now: () => number;
  tileYieldCollectedAt: (tileKey: string, ownerId?: string) => number | undefined;
  tileYieldEconomyContextForPlayer: (player: RuntimePlayer) => RuntimeTileYieldEconomyContext;
  enrichTileWithTownContext: (
    tile: DomainTileState,
    player: RuntimePlayer | undefined,
    context: RuntimeTileYieldEconomyContext
  ) => DomainTileState;
  yieldViewEconomyContext: (
    player: RuntimePlayer | undefined,
    ctx: RuntimeTileYieldEconomyContext | undefined
  ) => Parameters<typeof buildTileYieldView>[3];
};

/**
 * Builds the wire-format tile delta sent to clients — the single place that
 * decides which DomainTileState fields make it to the client for a given
 * tile update (command-triggered deltas; tileDeltaRevealOnly.ts is the
 * fog-of-war reveal counterpart). Overlay/worldgen fields (naturalWonder,
 * shardSite, fort, ...) come from tile-delta-overlay-fields.ts's shared
 * table — add a field there (and its cache entry in
 * tile-delta-stringify-cache.ts), not as a one-off line here.
 */
export const tileDeltaFromState = (
  deps: TileDeltaFromStateDeps,
  tile: DomainTileState,
  context?: RuntimeTileYieldEconomyContext,
  // full: true bypasses the sparse "only include fields that changed since
  // the last broadcast" diffing (and doesn't touch that shared last-emitted
  // cache either). A one-off "give me the current full detail" fetch (tile
  // detail RPC / debug download) shares tileDeltaStringifyCache's per-tile
  // last-emitted tracking with the regular incremental broadcast stream —
  // if nothing else touched this tile since the last broadcast emission,
  // the plain sparse path silently omits townJson (and any other
  // rarely-changing field), and the requester's merge then keeps whatever
  // stale value it already had cached. A full-detail fetch has no
  // meaningful "since last time" to diff against, so it must always get
  // the complete, current object.
  options?: { full?: boolean }
): SimulationTileWireDelta => {
  const player = tile.ownerId ? deps.players.get(tile.ownerId) : undefined;
  const resolvedContext = player && context?.player.id === player.id ? context : player ? deps.tileYieldEconomyContextForPlayer(player) : undefined;
  const enrichedTile = tile.town && resolvedContext ? deps.enrichTileWithTownContext(tile, player, resolvedContext) : tile;
  const yieldView = buildTileYieldView(enrichedTile, deps.tileYieldCollectedAt(simulationTileKey(tile.x, tile.y), tile.ownerId), deps.now(), deps.yieldViewEconomyContext(player, resolvedContext));
  const tileKey = simulationTileKey(tile.x, tile.y);
  const cached = deps.tileDeltaStringifyCache.getOrComputeAll(tileKey, tile);
  const fullDelta: SimulationTileWireDelta = {
    x: tile.x,
    y: tile.y,
    ...(tile.terrain ? { terrain: tile.terrain } : {}),
    ...(tile.resource ? { resource: tile.resource } : {}),
    ...(tile.dockId ? { dockId: tile.dockId } : {}),
    ...overlayJsonFieldsFrom(cached),
    // Conditional spread: prevents false clears on first delta; SparseEmit detects changes.
    ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
    ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
    ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
    ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
    ...(typeof tile.breachShockUntil === "number" ? { breachShockUntil: tile.breachShockUntil } : {}),
    ...(enrichedTile.town ? { townJson: JSON.stringify(enrichedTile.town) } : {}),
    ...(enrichedTile.town?.type ? { townType: enrichedTile.town.type } : {}),
    ...(enrichedTile.town?.name ? { townName: enrichedTile.town.name } : {}),
    ...(enrichedTile.town?.populationTier ? { townPopulationTier: enrichedTile.town.populationTier } : {}),
    ...(yieldView?.yield ? { yield: yieldView.yield } : {}),
    // yieldRate/yieldCap scoped emission: see tileYieldNeedsServerAuthority.
    ...(yieldView && tileYieldNeedsServerAuthority(tile) ? { yieldRate: yieldView.yieldRate, yieldCap: yieldView.yieldCap } : {})
  };
  return options?.full ? fullDelta : deps.tileDeltaStringifyCache.sparseEmit(tileKey, tile, cached, fullDelta);
};

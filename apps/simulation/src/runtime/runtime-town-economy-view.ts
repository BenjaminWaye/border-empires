// Main-thread producer of the AI planner's town-economy view
// (ai/build/town-economy-view.ts, docs/ai-economic-synergy-plan.md Phase 2).
//
// Reuses the cached connected-town network rather than walking the map: a
// cache miss rebuilds it the same uninstrumented way the manpower bonus path
// does (rebuildTownNetworkUninstrumented). The view itself is memoised per
// network object. runtime-economy-cache-invalidation.ts drops a player's
// network on every economy-relevant tile write (ownership, town, economic
// structure), so a new network object means the view may have changed and an
// unchanged one means it can't have.
import type { ConnectedTownNetworkEntry } from "../economy-network/economy-network.js";
import { buildTownEconomyView, type TownEconomyEntry } from "../ai/build/town-economy-view.js";
import { rebuildTownNetworkUninstrumented, type RuntimeTownNetworkContext } from "./runtime-town-network.js";

const viewByNetwork = new WeakMap<ReadonlyMap<string, ConnectedTownNetworkEntry>, readonly TownEconomyEntry[]>();

export const townEconomyViewForPlayer = (
  ctx: RuntimeTownNetworkContext,
  playerId: string
): readonly TownEconomyEntry[] | undefined => {
  const player = ctx.players.get(playerId);
  if (!player) return undefined;
  const townKeys = ctx.summaryForPlayer(playerId).ownedTownTierByTile.keys();
  const network =
    ctx.townNetworkCacheByPlayer.get(playerId) ??
    rebuildTownNetworkUninstrumented(ctx, player, ctx.settledTilesForPlayer(playerId));
  const cached = viewByNetwork.get(network);
  if (cached) return cached;
  const view = buildTownEconomyView(playerId, townKeys, ctx.tiles, network);
  viewByNetwork.set(network, view);
  return view;
};

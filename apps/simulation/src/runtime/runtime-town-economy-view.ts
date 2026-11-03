// Main-thread producer of the AI planner's town-economy view
// (ai/build/town-economy-view.ts, docs/ai-economic-synergy-plan.md Phase 2).
//
// Reuses the cached connected-town network rather than walking the map. On a
// cache miss the planner export rebuilds it through the instrumented
// cachedTownNetworkForPlayer (so the cost shows up as town_network_rebuild in
// main-thread task metrics); the 1 s metrics tick passes rebuildOnMiss: false
// and gets the player's last view instead, so it never forces a rebuild.
//
// The view is memoised per network object. runtime-economy-cache-invalidation.ts
// drops a player's network on every economy-relevant tile write (ownership,
// town, economic structure), which covers every field the view counts. It does
// not cover dormancy (a FOOD-slot shortfall writes no tile), and the view
// ignores dormancy anyway: it counts what is built, not what is powered.
import type { ConnectedTownNetworkEntry } from "../economy-network/economy-network.js";
import { buildTownEconomyView, type TownEconomyEntry } from "../ai/build/town-economy-view.js";
import { cachedTownNetworkForPlayer, type RuntimeTownNetworkContext } from "./runtime-town-network.js";

const viewByNetwork = new WeakMap<ReadonlyMap<string, ConnectedTownNetworkEntry>, readonly TownEconomyEntry[]>();
// Last view per player, for callers that must not trigger a rebuild. Bounded
// by the player roster; entries for removed players are dropped on read.
const lastViewByPlayer = new Map<string, readonly TownEconomyEntry[]>();

export type TownEconomyViewOptions = { rebuildOnMiss?: boolean };

export const townEconomyViewForPlayer = (
  ctx: RuntimeTownNetworkContext,
  playerId: string,
  options: TownEconomyViewOptions = {}
): readonly TownEconomyEntry[] | undefined => {
  const player = ctx.players.get(playerId);
  if (!player) {
    lastViewByPlayer.delete(playerId);
    return undefined;
  }
  const cachedNetwork = ctx.townNetworkCacheByPlayer.get(playerId);
  if (!cachedNetwork && options.rebuildOnMiss === false) return lastViewByPlayer.get(playerId);
  // maxConnectedTownNames 0 matches the other economy readers of this cache.
  const network = cachedNetwork ?? cachedTownNetworkForPlayer(ctx, player, ctx.settledTilesForPlayer(playerId), 0);
  let view = viewByNetwork.get(network);
  if (!view) {
    view = buildTownEconomyView(playerId, ctx.summaryForPlayer(playerId).ownedTownTierByTile.keys(), ctx.tiles, network);
    viewByNetwork.set(network, view);
  }
  lastViewByPlayer.set(playerId, view);
  return view;
};

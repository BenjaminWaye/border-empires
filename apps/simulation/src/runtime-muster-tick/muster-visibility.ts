import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { RuntimePlayer } from "../runtime-types.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

export type MusterVisibilityDeps = {
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  dockNetworkComponentByTileKey: ReadonlyMap<string, ReadonlySet<string>>;
  visibilityCoverage: { isVisible(viewerId: string, tileKey: string): boolean };
};

/**
 * Whether `playerId` can currently see tile (x, y) -- the same vision the
 * client is sent (runtime-visibility-classifier.ts): the incrementally
 * maintained coverage cache (own/ally territory radius, town rings, structure
 * bonuses) plus the radius-1 reveal around the far end of a dock link from a
 * SETTLED dock the player or an ally holds.
 *
 * The dock check runs in reverse: instead of collecting every owned dock's
 * reveal set (a scan of all docks), it looks at the <= 9 tiles around (x, y)
 * for a registered dock D, then asks whether any dock in D's network links
 * *to* D from a qualifying owner -- the classifier's own direction, since dock
 * links are built per dock and need not be symmetric. Off the dock network it
 * is 9 map lookups; next to a dock, O(that network's size).
 */
export const isTileVisibleToPlayer = (deps: MusterVisibilityDeps, playerId: string, x: number, y: number): boolean => {
  if (deps.visibilityCoverage.isVisible(playerId, simulationTileKey(x, y))) return true;
  const player = deps.players.get(playerId);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nearKey = simulationTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
      for (const sourceKey of deps.dockNetworkComponentByTileKey.get(nearKey) ?? []) {
        if (!deps.dockLinksByDockTileKey.get(sourceKey)?.includes(nearKey)) continue;
        const source = deps.tiles.get(sourceKey);
        if (source?.ownershipState !== "SETTLED" || !source.ownerId) continue;
        if (source.ownerId === playerId || player?.allies.has(source.ownerId)) return true;
      }
    }
  }
  return false;
};

import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { RuntimePlayer } from "../runtime-types.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

export type MusterVisibilityDeps = {
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
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
 * for a dock linked back to such a dock. O(1) per call, so a muster search can
 * ask it per candidate.
 */
export const isTileVisibleToPlayer = (deps: MusterVisibilityDeps, playerId: string, x: number, y: number): boolean => {
  if (deps.visibilityCoverage.isVisible(playerId, simulationTileKey(x, y))) return true;
  const player = deps.players.get(playerId);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nearKey = simulationTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
      if (deps.tiles.get(nearKey)?.dockId === undefined) continue;
      for (const linkedKey of deps.dockLinksByDockTileKey.get(nearKey) ?? []) {
        const linked = deps.tiles.get(linkedKey);
        if (linked?.ownershipState !== "SETTLED" || !linked.ownerId) continue;
        if (linked.ownerId === playerId || player?.allies.has(linked.ownerId)) return true;
      }
    }
  }
  return false;
};

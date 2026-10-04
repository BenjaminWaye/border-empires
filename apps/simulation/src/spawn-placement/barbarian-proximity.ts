import { TOWN_REACH_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

import { simulationTileKey } from "../seed-state/seed-state.js";

// A fresh AFC's reach is TOWN_REACH_RADIUS; two more tiles keeps the spawn from
// landing right on the edge of a barbarian pocket that the landing wipe
// (afc-landing-barbarian-clear.ts) only clears out to the reach boundary.
export const BARBARIAN_SPAWN_AVOID_RADIUS = TOWN_REACH_RADIUS + 2;

/**
 * True when any barbarian-owned tile lies within `radius` (Chebyshev, wrapped)
 * of (x, y). Spawn placement's own settled-tile index deliberately ignores
 * barbarians (they must not push real players apart), so this is the separate,
 * best-effort preference for not landing inside one. Scans at most
 * (2r+1)^2 tiles and stops at the first hit; callers run it LAST in their
 * candidate checks so it only costs anything for otherwise-acceptable sites.
 */
export const hasBarbarianWithin = (tiles: ReadonlyMap<string, DomainTileState>, x: number, y: number, radius: number): boolean => {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (tiles.get(simulationTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT)))?.ownerId?.startsWith("barbarian-")) return true;
    }
  }
  return false;
};

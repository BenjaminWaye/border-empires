// Is a neighbour's land worth an AI's effort to take? Owner rule (Playtest Run 4 follow-up): an alliance is a
// pledge to help the bloc's largest member win, so a big AI gladly allies a small House it can't reach -- but
// allying a weak *neighbour* means giving up land it could take. It does that only when taking it isn't worth
// the effort: nothing of value near its border, or every town and resource there covered by a fort.
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

type Tile = { x: number; y: number; ownerId?: string | undefined; townJson?: string | undefined; fortJson?: string | undefined; resource?: string | undefined };

/** How far from the AI's land a town or resource still counts as "near its border". */
export const CONQUEST_BORDER_DEPTH = 3;
/** A fort covers its own tile and every tile this close (SETTLED_DEFENSE_NEAR_FORT_RADIUS). */
export const FORT_COVER_RADIUS = 1;

const key = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;

const anyWithin = (keys: ReadonlySet<string>, x: number, y: number, radius: number): boolean => {
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) if (keys.has(key(x + dx, y + dy))) return true;
  }
  return false;
};

/**
 * True when the requester holds a town or resource within CONQUEST_BORDER_DEPTH of the AI's land that no fort
 * covers: land worth taking, so the AI would rather fight than ally. False when there's nothing of value near the
 * border, or it is all fortified. Reads only tiles in the AI's own view.
 */
export const requesterLandWorthTaking = (tiles: readonly Tile[], aiPlayerId: string, requesterId: string): boolean => {
  const aiKeys = new Set<string>();
  const forts = new Set<string>();
  const valuable: Tile[] = [];
  for (const tile of tiles) {
    if (tile.ownerId === aiPlayerId) aiKeys.add(key(tile.x, tile.y));
    else if (tile.ownerId === requesterId) {
      if (tile.fortJson) forts.add(key(tile.x, tile.y));
      if (tile.townJson || tile.resource) valuable.push(tile);
    }
  }
  if (aiKeys.size === 0) return false;
  return valuable.some((tile) => anyWithin(aiKeys, tile.x, tile.y, CONQUEST_BORDER_DEPTH) && !anyWithin(forts, tile.x, tile.y, FORT_COVER_RADIUS));
};

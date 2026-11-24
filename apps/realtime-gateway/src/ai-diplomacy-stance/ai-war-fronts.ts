// Can an AI afford one more war? Owner rule (Playtest Run 4 follow-up): before it turns on a weak neighbour
// instead of allying it, an AI counts the fronts it is already fighting on and checks that its army can cover
// one more. A stretched AI keeps the alliance, whatever the neighbour's land is worth.
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

type Tile = { x: number; y: number; ownerId?: string | undefined };

/** Each front, the new one included, needs this share of the AI's manpower cap in fighting strength. */
export const FRONT_MANPOWER_SHARE = 0.25;

const key = (x: number, y: number): string => `${wrapX(x, WORLD_WIDTH)},${wrapY(y, WORLD_HEIGHT)}`;

/**
 * Empires the AI is at war with whose land touches its own in the AI's view: the fronts it is fighting on.
 * Barbarians and `exclude` (the neighbour being weighed) don't count.
 */
export const warFrontsInView = (tiles: readonly Tile[], aiId: string, atWarWith: (playerId: string) => boolean, exclude?: string): number => {
  const ownerByKey = new Map<string, string>();
  for (const tile of tiles) if (tile.ownerId) ownerByKey.set(key(tile.x, tile.y), tile.ownerId);
  const fronts = new Set<string>();
  for (const tile of tiles) {
    if (tile.ownerId !== aiId) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const owner = ownerByKey.get(key(tile.x + dx, tile.y + dy));
      if (!owner || owner === aiId || owner === exclude || owner.startsWith("barbarian-") || fronts.has(owner)) continue;
      if (atWarWith(owner)) fronts.add(owner);
    }
  }
  return fronts.size;
};

/** True when the AI's fighting strength (free + mustered manpower) covers every current front plus one more. */
export const canOpenAnotherFront = (fightingStrength: number, manpowerCap: number, fronts: number): boolean =>
  manpowerCap > 0 && fightingStrength / manpowerCap >= (fronts + 1) * FRONT_MANPOWER_SHARE;

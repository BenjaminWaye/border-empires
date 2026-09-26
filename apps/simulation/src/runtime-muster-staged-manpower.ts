import type { DomainTileState } from "@border-empires/game-domain";

/**
 * Manpower sitting inside a player's own muster flags (already out of the pool).
 * O(flags): `musterKeys` is the runtime's per-owner flag index, so this never
 * scans the world. Skips stale index entries (tile lost its flag / changed owner).
 */
export const musterStagedManpowerForPlayer = (
  playerId: string,
  musterKeys: Iterable<string> | undefined,
  tiles: ReadonlyMap<string, Pick<DomainTileState, "muster">>
): number => {
  let staged = 0;
  for (const key of musterKeys ?? []) {
    const muster = tiles.get(key)?.muster;
    if (muster && muster.ownerId === playerId) staged += muster.amount;
  }
  return staged;
};

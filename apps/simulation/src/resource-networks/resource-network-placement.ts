import { computeFairSpawnSites, type DomainTileState } from "@border-empires/game-domain";

export const networkPlacementHash = (seed: number, x: number, y: number): number => {
  let n = Math.imul(seed ^ x, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};
export const networkTileKey = (x: number, y: number, width: number, height: number): string =>
  `${(x + width) % width},${(y + height) % height}`;

export const isEmptyNetworkSite = (tile: DomainTileState): boolean =>
  tile.terrain === "LAND" && !tile.resource && !tile.town && !tile.dockId && !tile.afc &&
  !tile.naturalWonder && !tile.shardSite && !tile.watchtower && !tile.waystation && !tile.economicStructure;

/** Preserve existing AFC clearings and fifty qualified future 3x3 landings. */
export const protectedNetworkLandingKeys = (tiles: readonly DomainTileState[], width: number, height: number): ReadonlySet<string> => {
  const protectedKeys = new Set<string>(); // At most the number of world tiles.
  const protect = (x: number, y: number, radius: number): void => {
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1)
      protectedKeys.add(networkTileKey(x + dx, y + dy, width, height));
  };
  for (const tile of tiles) if (tile.afc) protect(tile.x, tile.y, 2);
  for (const site of computeFairSpawnSites(tiles, 50, { requireStarterEconomy: true, width, height })) protect(site.x, site.y, 1);
  return protectedKeys;
};

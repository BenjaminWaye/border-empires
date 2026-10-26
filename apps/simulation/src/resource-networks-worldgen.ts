import { computeFairSpawnSites, type DomainTileState } from "@border-empires/game-domain";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS, isResinTreeSiteAt } from "@border-empires/shared";

const hash = (seed: number, x: number, y: number): number => {
  let n = Math.imul(seed ^ x, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

/** Bounded by the world area; balanced across 32x32 sectors, independent of ownership. */
export function seedResourceNetworks(tiles: Map<string, DomainTileState>, seed: number, width: number, height: number, resinAt: (x: number, y: number) => boolean = isResinTreeSiteAt, resinOnly = false): void {
  const sectors = new Map<string, DomainTileState[]>();
  // Resources block an AFC's clear 3x3 landing footprint. Preserve the same
  // fifty qualified future starts that the season's fairness gate guarantees.
  const tileList = [...tiles.values()];
  const protectedKeys = new Set<string>();
  const protect = (x: number, y: number, radius: number): void => {
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1)
      protectedKeys.add(`${(x + dx + width) % width},${(y + dy + height) % height}`);
  };
  for (const tile of tileList) if (tile.afc) protect(tile.x, tile.y, 2);
  for (const site of computeFairSpawnSites(tileList, 50, { requireStarterEconomy: true, width, height })) protect(site.x, site.y, 1);
  for (const tile of tiles.values()) {
    if (tile.terrain !== "LAND" || tile.resource || tile.town || tile.dockId || tile.afc ||
        tile.naturalWonder || tile.shardSite || tile.watchtower || tile.waystation || tile.economicStructure) continue;
    if (protectedKeys.has(`${tile.x},${tile.y}`)) continue;
    if (resinAt(tile.x, tile.y)) {
      tiles.set(`${tile.x},${tile.y}`, { ...tile, resource: "NEURAL_RESIN" });
      continue;
    }
    if (resinOnly) continue;
    const key = `${Math.floor(tile.x / 32)},${Math.floor(tile.y / 32)}`;
    const sector = sectors.get(key) ?? [];
    sector.push(tile);
    sectors.set(key, sector);
  }
  const ordered = [...sectors.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, sector]) =>
    sector.sort((a, b) => hash(seed, a.x, a.y) - hash(seed, b.x, b.y) || a.y - b.y || a.x - b.x));
  if (resinOnly) return;
  let cursor = hash(seed, width, height) % Math.max(1, ordered.length);
  for (const resource of NETWORK_RESOURCES) {
    if (resource === "NEURAL_RESIN") continue; // Resin follows every scattered tree, not a quota.
    const target = Math.round(RESOURCE_NETWORKS[resource].sitesPerStandardMap * width * height / (640 * 320));
    for (let placed = 0; placed < target; placed += 1) {
      let tile: DomainTileState | undefined;
      for (let attempts = 0; attempts < ordered.length; attempts += 1) {
        tile = ordered[cursor % ordered.length]?.pop();
        cursor += 1;
        if (tile) break;
      }
      if (!tile) break; // Small/custom maps may lack enough eligible sites.
      tiles.set(`${tile.x},${tile.y}`, { ...tile, resource });
    }
  }
}

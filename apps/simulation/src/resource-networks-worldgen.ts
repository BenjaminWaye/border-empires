import type { DomainTileState } from "@border-empires/game-domain";
import { NETWORK_RESOURCES, RESOURCE_NETWORKS } from "@border-empires/shared";

const hash = (seed: number, x: number, y: number): number => {
  let n = Math.imul(seed ^ x, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
};

/** Bounded by the world area; balanced across 32x32 sectors, independent of ownership. */
export function seedResourceNetworks(tiles: Map<string, DomainTileState>, seed: number, width: number, height: number): void {
  const sectors = new Map<string, DomainTileState[]>();
  const afcs = [...tiles.values()].filter(tile => tile.afc);
  for (const tile of tiles.values()) {
    if (tile.terrain !== "LAND" || tile.resource || tile.town || tile.dockId || tile.afc ||
        tile.naturalWonder || tile.shardSite || tile.watchtower || tile.waystation || tile.economicStructure) continue;
    if (afcs.some(afc => Math.min(Math.abs(tile.x - afc.x), width - Math.abs(tile.x - afc.x)) <= 2 &&
      Math.min(Math.abs(tile.y - afc.y), height - Math.abs(tile.y - afc.y)) <= 2)) continue;
    const key = `${Math.floor(tile.x / 32)},${Math.floor(tile.y / 32)}`;
    const sector = sectors.get(key) ?? [];
    sector.push(tile);
    sectors.set(key, sector);
  }
  const ordered = [...sectors.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, sector]) =>
    sector.sort((a, b) => hash(seed, a.x, a.y) - hash(seed, b.x, b.y) || a.y - b.y || a.x - b.x));
  let cursor = hash(seed, width, height) % Math.max(1, ordered.length);
  for (const resource of NETWORK_RESOURCES) {
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

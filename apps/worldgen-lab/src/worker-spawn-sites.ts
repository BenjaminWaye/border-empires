import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { computeFairSpawnSites, type DomainTileState } from "@border-empires/game-domain";

export const FAIR_SPAWN_SITE_TARGET = 50;

// Reuses the real production selection algorithm (computeFairSpawnSites,
// game-domain) rather than re-implementing the tiering/spread logic here, so
// the lab's spawn-site preview stays exactly accurate as that algorithm
// evolves — same idiom as worker.ts's placeResourceClusters/placeNaturalWonders.
// townIndices/resourceLayer are the lab's own estimates (see their
// approximation notes in worker.ts), so the fair-spawn-site count shown is
// only as accurate as those estimates, not a guarantee of what the real
// worldgen pipeline would produce for this exact seed.
export const computeSpawnSiteIndices = (terrain: Uint8Array, resourceLayer: Uint8Array, townIndices: Uint32Array): Uint32Array => {
  const townSet = new Set(townIndices);
  const tiles: DomainTileState[] = [];
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const idx = y * WORLD_WIDTH + x;
      const code = terrain[idx];
      const tileTerrain = code === 1 ? "LAND" : code === 2 ? "MOUNTAIN" : code === 3 ? "COASTAL_SEA" : "SEA";
      if (tileTerrain !== "LAND") {
        tiles.push({ x, y, terrain: tileTerrain });
        continue;
      }
      // resourceLayer codes: 2=FARM 5=FISH (see RESOURCE_TINT in renderer.ts)
      const resCode = resourceLayer[idx] ?? 0;
      const resource = resCode === 2 ? "FARM" : resCode === 5 ? "FISH" : undefined;
      tiles.push({
        x, y, terrain: tileTerrain,
        ...(townSet.has(idx) ? { town: { type: "MARKET" as const, populationTier: "SETTLEMENT" as const } } : {}),
        ...(resource ? { resource } : {})
      });
    }
  }
  const sites = computeFairSpawnSites(tiles, FAIR_SPAWN_SITE_TARGET);
  return new Uint32Array(sites.map((site) => site.y * WORLD_WIDTH + site.x));
};

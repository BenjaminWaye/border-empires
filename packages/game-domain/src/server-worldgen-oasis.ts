import type { ServerWorldgenOasisDeps, ServerWorldgenOasisRuntime } from "./server-world-runtime-types.js";

// Desert regions otherwise have no reliable food source close enough to
// support a town (FARM needs GRASS, FISH needs coastline — see
// server-worldgen-terrain.ts's clusterRuleMatch), so a block that's mostly
// SAND and has no real FARM/FISH cluster gets a hand-carved oasis instead:
// a 2x2 water tile with a ring of GRASS+FARM tiles around it, indistinguishable
// downstream from a natural cluster to ensureBaselineEconomyCoverage's
// hasFood check (radius > 1) and to town/dock food-proximity scoring.
// Deliberately kept a rare relief valve, not a routine fix, so desert stays
// scarcer land than grassland: only a fraction of qualifying blocks actually
// get one (OASIS_TRIGGER_CHANCE), and the sand-fraction bar is high
// (OASIS_SAND_FRACTION_THRESHOLD) so it only fires in solidly desert blocks.
const OASIS_BLOCK_SIZE = 30;
const OASIS_SAND_FRACTION_THRESHOLD = 0.75;
const OASIS_TRIGGER_CHANCE = 0.35;
const OASIS_MAX_ATTEMPTS_PER_BLOCK = 200;

export const createServerWorldgenOasis = (deps: ServerWorldgenOasisDeps): ServerWorldgenOasisRuntime => {
  const { seeded01, WORLD_WIDTH, WORLD_HEIGHT, wrapX, wrapY, terrainAt, overrideTerrainAt, landBiomeAt, overrideLandBiomeAt, key, clusterByTile, clustersById } = deps;

  const generateOases = (seed: number): void => {
    const reserved = new Set<string>();
    const isFreeLand = (x: number, y: number): boolean => terrainAt(x, y) === "LAND" && !clusterByTile.has(key(x, y)) && !reserved.has(key(x, y));

    for (let by = 0; by < WORLD_HEIGHT; by += OASIS_BLOCK_SIZE) {
      for (let bx = 0; bx < WORLD_WIDTH; bx += OASIS_BLOCK_SIZE) {
        let landCount = 0;
        let sandCount = 0;
        let hasFood = false;
        for (let dy = 0; dy < OASIS_BLOCK_SIZE; dy += 1) {
          for (let dx = 0; dx < OASIS_BLOCK_SIZE; dx += 1) {
            const x = wrapX(bx + dx, WORLD_WIDTH);
            const y = wrapY(by + dy, WORLD_HEIGHT);
            if (terrainAt(x, y) !== "LAND") continue;
            landCount += 1;
            if (landBiomeAt(x, y) === "SAND") sandCount += 1;
            const clusterId = clusterByTile.get(key(x, y));
            const cluster = clusterId ? clustersById.get(clusterId) : undefined;
            if (cluster && cluster.radius > 1 && (cluster.resourceType === "FARM" || cluster.resourceType === "FISH")) hasFood = true;
          }
        }
        if (landCount === 0 || hasFood) continue;
        if (sandCount / landCount < OASIS_SAND_FRACTION_THRESHOLD) continue;
        if (seeded01(bx + 5, by + 5, seed + 8291) >= OASIS_TRIGGER_CHANCE) continue;

        // Candidates are drawn from the full block, not just its interior:
        // the pond+ring free-land check below is wrap-aware and absolute, so
        // a center near the block edge (with its ring spilling into the
        // neighboring block) is just as valid — shrinking the search to the
        // interior would silently miss desert that straddles a block seam.
        for (let tries = 0; tries < OASIS_MAX_ATTEMPTS_PER_BLOCK; tries += 1) {
          const cx = wrapX(bx + Math.floor(seeded01(bx + tries * 7, by + tries * 11, seed + 8301) * OASIS_BLOCK_SIZE), WORLD_WIDTH);
          const cy = wrapY(by + Math.floor(seeded01(bx + tries * 13, by + tries * 17, seed + 8351) * OASIS_BLOCK_SIZE), WORLD_HEIGHT);
          if (landBiomeAt(cx, cy) !== "SAND") continue;

          const pond = [
            { x: cx, y: cy },
            { x: wrapX(cx + 1, WORLD_WIDTH), y: cy },
            { x: cx, y: wrapY(cy + 1, WORLD_HEIGHT) },
            { x: wrapX(cx + 1, WORLD_WIDTH), y: wrapY(cy + 1, WORLD_HEIGHT) }
          ];
          if (!pond.every((tile) => isFreeLand(tile.x, tile.y))) continue;

          const ring: Array<{ x: number; y: number }> = [];
          let ringValid = true;
          for (let ry = -1; ry <= 2 && ringValid; ry += 1) {
            for (let rx = -1; rx <= 2; rx += 1) {
              if (rx >= 0 && rx <= 1 && ry >= 0 && ry <= 1) continue; // inside the pond
              const x = wrapX(cx + rx, WORLD_WIDTH);
              const y = wrapY(cy + ry, WORLD_HEIGHT);
              if (!isFreeLand(x, y)) {
                ringValid = false;
                break;
              }
              ring.push({ x, y });
            }
          }
          if (!ringValid) continue;

          for (const tile of pond) {
            overrideTerrainAt(tile.x, tile.y, "SEA");
            reserved.add(key(tile.x, tile.y));
          }
          const clusterId = `cl-oasis-${clustersById.size}`;
          clustersById.set(clusterId, {
            clusterId,
            clusterType: "FERTILE_PLAINS",
            resourceType: "FARM",
            centerX: cx,
            centerY: cy,
            radius: 2,
            controlThreshold: 3
          });
          for (const tile of ring) {
            overrideLandBiomeAt(tile.x, tile.y, "GRASS");
            const tileKey = key(tile.x, tile.y);
            clusterByTile.set(tileKey, clusterId);
            reserved.add(tileKey);
          }
          break;
        }
      }
    }
  };

  return { generateOases };
};

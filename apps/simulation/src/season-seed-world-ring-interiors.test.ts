import { describe, expect, it } from "vitest";
import { setWorldSeed, terrainAt, enumerateMountainRings, type TileKey, type WorldStyle } from "@border-empires/shared";
import { WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import { createSeasonSeedWorld } from "./season-seed-world.js";

const noopPlayer = (id: string, isAi: boolean) => ({
  id,
  isAi,
  gold: 0,
  ownedTiles: new Set<TileKey>()
}) as unknown as import("@border-empires/game-domain").DomainPlayer;

// For a generated world, every mountain ring interior that has any land tile
// should have something on it (a town, a resource cluster, or a dock) —
// see season-seed-world-ring-interiors.ts. This test enumerates rings with
// the exact same seeding worldgen uses (enumerateMountainRings), so it
// exercises the real bug: before the fillMountainRingInteriors pass existed,
// the vast majority of land-accessible ring interiors had nothing placed in
// them, because ensureBaselineEconomyCoverage/ensureInterestCoverage sweep
// fixed 30x30/15x15 grid blocks, not ring interiors specifically.
const checkRingCoverage = (
  seed: number,
  style: WorldStyle,
  tiles: Map<string, import("@border-empires/game-domain").DomainTileState>
): { total: number; covered: number; emptyRings: Array<{ cx: number; cy: number }> } => {
  setWorldSeed(seed, style);
  const rings = enumerateMountainRings(WORLD_WIDTH, WORLD_HEIGHT);
  let total = 0;
  let covered = 0;
  const emptyRings: Array<{ cx: number; cy: number }> = [];
  for (const ring of rings) {
    const radius = ring.innerRadius;
    let hasLand = false;
    let hasContent = false;
    for (let dy = -radius; dy <= radius && !hasContent; dy += 1) {
      for (let dx = -radius; dx <= radius && !hasContent; dx += 1) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = ((ring.cx + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
        const y = ((ring.cy + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
        if (terrainAt(x, y) !== "LAND") continue;
        hasLand = true;
        const tile = tiles.get(`${x},${y}`);
        if (tile?.town || tile?.resource || tile?.dockId) hasContent = true;
      }
    }
    if (!hasLand) continue; // entirely sea/lake — nothing to place on, correctly skipped
    total += 1;
    if (hasContent) covered += 1;
    else emptyRings.push({ cx: ring.cx, cy: ring.cy });
  }
  return { total, covered, emptyRings };
};

describe("mountain ring interior coverage", () => {
  it("gives every land-accessible ring interior a town/cluster/dock across sampled seeds (continents + islands)", () => {
    const seeds = [101, 202, 303, 404, 505];
    for (const style of ["continents", "islands"] as const) {
      for (const seed of seeds) {
        const world = createSeasonSeedWorld(seed, noopPlayer, { humanPlayerCount: 0, aiPlayerCount: 4, style });
        const result = checkRingCoverage(world.worldSeed, style, world.tiles);
        // eslint-disable-next-line no-console
        console.log(`style=${style} seed=${seed}(->${world.worldSeed}) rings=${result.total} covered=${result.covered} empty=${result.emptyRings.length}`);
        expect(result.total).toBeGreaterThan(0);
        expect(result.covered).toBe(result.total);
      }
    }
  }, 60_000);
});

import { describe, expect, it } from "vitest";
import { WORLD_WIDTH, WORLD_HEIGHT, isSeaTerrain, wrapX, wrapY, type TileKey, type WorldStyle } from "@border-empires/shared";
import { createSeasonSeedWorld } from "./season-seed-world.js";
import { parseTestShard, valuesForTestShard } from "./season-seed-world-coverage-shard.test-support.js";
import { computeFairSpawnSites, starterSiteQuality } from "@border-empires/game-domain";

const noopPlayer = (id: string, isAi: boolean) => ({
  id,
  isAi,
  gold: 0,
  ownedTiles: new Set<TileKey>()
}) as unknown as import("@border-empires/game-domain").DomainPlayer;

// Verifies (against the real season-seed-world.ts pipeline, not the
// worldgen-lab approximation) that every sea-adjacent land component ends up
// with a dock in docksByTile, across many seeds and both world styles.
const countUncoveredSeaAdjacentComponents = (tiles: Map<string, import("@border-empires/game-domain").DomainTileState>): number => {
  const terrainAtT = (x: number, y: number): string => tiles.get(`${x},${y}`)?.terrain ?? "SEA";
  const visited = new Uint8Array(WORLD_WIDTH * WORLD_HEIGHT);
  let uncovered = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      const idx = y * WORLD_WIDTH + x;
      if (visited[idx] || terrainAtT(x, y) !== "LAND") continue;
      const stack = [[x, y]];
      visited[idx] = 1;
      let touchesSea = false;
      let hasDock = false;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        const tile = tiles.get(`${cx},${cy}`);
        if (tile?.dockId) hasDock = true;
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
          const nx = wrapX(cx + dx, WORLD_WIDTH);
          const ny = wrapY(cy + dy, WORLD_HEIGHT);
          if (isSeaTerrain(terrainAtT(nx, ny) as never)) touchesSea = true;
        }
        for (let ddy = -1; ddy <= 1; ddy += 1) {
          for (let ddx = -1; ddx <= 1; ddx += 1) {
            if (ddx === 0 && ddy === 0) continue;
            const nx = wrapX(cx + ddx, WORLD_WIDTH);
            const ny = wrapY(cy + ddy, WORLD_HEIGHT);
            const nidx = ny * WORLD_WIDTH + nx;
            if (visited[nidx] || terrainAtT(nx, ny) !== "LAND") continue;
            visited[nidx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (touchesSea && !hasDock) uncovered += 1;
    }
  }
  return uncovered;
};

describe("real-pipeline dock coverage", () => {
  it("gives every sea-adjacent land component a dock across many seeds, both styles", () => {
    const shard = parseTestShard(process.env.WORLDGEN_COVERAGE_SHARD);
    const seeds = valuesForTestShard(
      Array.from({ length: 12 }, (_, i) => 1000 + i * 37),
      shard
    );
    const results: string[] = [];
    let anyUncovered = 0;
    for (const style of ["continents", "islands"] as WorldStyle[]) {
      for (const seed of seeds) {
        const world = createSeasonSeedWorld(seed, noopPlayer, { humanPlayerCount: 1, aiPlayerCount: 4, style });
        const uncovered = countUncoveredSeaAdjacentComponents(world.tiles);
        // Exercise the complete pipeline, including AI placement and wonders,
        // rather than accepting fifty legal but amenity-free grass tiles.
        const starterSites = computeFairSpawnSites([...world.tiles.values()], 50, { requireStarterEconomy: true });
        expect(starterSites, `style=${style} seed=${seed}`).toHaveLength(50);
        for (const site of starterSites) expect(starterSiteQuality(world.tiles, site.x, site.y)).toBeDefined();
        const capital = [...world.tiles.values()].find((tile) => tile.ownerId === "player-1")!;
        const opening = new Map(world.tiles);
        opening.set(`${capital.x},${capital.y}`, { x: capital.x, y: capital.y, terrain: capital.terrain });
        expect(starterSiteQuality(opening, capital.x, capital.y), `human spawn style=${style} seed=${seed}`).toBeDefined();
        anyUncovered += uncovered;
        results.push(`style=${style} seed=${seed} uncoveredSeaAdjacentComponents=${uncovered}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`shard=${shard.index}/${shard.total}\n${results.join("\n")}`);
    expect(seeds).not.toHaveLength(0);
    expect(anyUncovered).toBe(0);
  // Full generation now includes bounded route qualification and seed retries.
  }, 480_000);
});

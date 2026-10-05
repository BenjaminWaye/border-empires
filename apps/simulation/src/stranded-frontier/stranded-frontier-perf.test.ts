import { describe, expect, it } from "vitest";
import { CHUNK_SIZE } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";
import type { RuntimeEncirclementApplicationContext } from "../runtime-encirclement-application.js";
import { createStrandedFrontierCleanup, ORIGIN_MAX_VISITED } from "./stranded-frontier-cleanup.js";
import { strandedFrontierCounter } from "./stranded-frontier-metrics.js";

// Perf gate for the on-demand stranded-frontier checks, which run on the sim
// main thread. Worst cases: a whole chunk of one owner's frontier with no
// supply terminal (the region check explores until its cap), and an origin
// buried deep in a huge connected frontier (the origin check's slow path
// explores until its cap). Both must stay a few milliseconds even on CI.

const buildContext = (tiles: Map<string, DomainTileState>): RuntimeEncirclementApplicationContext => ({
  tiles,
  now: () => 1_000,
  activeAetherBridgesForPlayer: () => [],
  replaceTileState: (key, tile) => { tiles.set(key, tile); },
  tileDeltaFromState: (tile) => ({ x: tile.x, y: tile.y }),
  emitEvent: () => undefined,
  runtimeLogInfo: () => undefined,
  registerFrontierAutoHeal: () => undefined
});

const frontierBlock = (width: number, height: number, ownerId: string): Map<string, DomainTileState> => {
  const tiles = new Map<string, DomainTileState>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.set(`${x},${y}`, { x, y, terrain: "LAND", ownerId, ownershipState: "FRONTIER" });
    }
  }
  return tiles;
};

describe("stranded frontier perf gate", () => {
  it("region check over a full chunk of capped frontier stays under 25ms and releases nothing", () => {
    const tiles = frontierBlock(CHUNK_SIZE, CHUNK_SIZE, "p1"); // 4096 tiles, one component, no terminal
    const cleanup = createStrandedFrontierCleanup(() => buildContext(tiles));
    const capHitsBefore = strandedFrontierCounter("capHits");

    const start = performance.now();
    const released = cleanup.checkRegion(0, 0, "perf-region");
    const elapsed = performance.now() - start;

    console.log(`[perf-gate] stranded region check, 4096-tile capped chunk: ${elapsed.toFixed(2)}ms`);
    expect(released).toBe(0); // over the cap: fails open
    expect(strandedFrontierCounter("capHits")).toBe(capHitsBefore + 1);
    expect(elapsed).toBeLessThan(25);
  });

  it("origin check deep inside a large connected frontier stays under 10ms", () => {
    const tiles = frontierBlock(200, 200, "p1"); // 40k frontier tiles
    tiles.set("0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" });
    const cleanup = createStrandedFrontierCleanup(() => buildContext(tiles));

    const start = performance.now();
    const released = cleanup.releaseIfStrandedOrigin("150,150", "p1", "perf-origin");
    const elapsed = performance.now() - start;

    console.log(`[perf-gate] stranded origin check, slow path capped at ${ORIGIN_MAX_VISITED}: ${elapsed.toFixed(2)}ms`);
    expect(released).toBe(false); // connected (and capped before proving otherwise): never released
    expect(tiles.get("150,150")?.ownerId).toBe("p1");
    expect(elapsed).toBeLessThan(10);
  });
});

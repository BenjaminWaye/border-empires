import { describe, expect, it } from "vitest";
import type { NaturalWonderType, TileKey, Terrain, LandBiome, RegionType } from "@border-empires/shared";

import { key } from "./server-game-constants/server-game-constants.js";
import { createServerWorldgenNaturalWonders } from "./server-worldgen-natural-wonders.js";
import type { ClusterDefinition, NaturalWonderSiteState } from "./server-shared-types.js";

/**
 * Synthetic 50x50 world with hand-authored region/biome/terrain bands so
 * every wonder's spawn predicate (docs/natural-wonders-design.md §2) has a
 * satisfiable target zone, and every zone is far enough from the others to
 * clear the ≥8-tile inter-wonder spacing rule (§3.2). Real worldgen noise
 * functions aren't exercised here — deterministic hand-authored predicates
 * make the placement algorithm itself the thing under test.
 */
const WORLD_WIDTH = 50;
const WORLD_HEIGHT = 50;
const MOUNTAIN_A = { x: 25, y: 10 };
const MOUNTAIN_B = { x: 25, y: 40 };
const SEA_COLUMN_X = 34;

const terrainAt = (x: number, y: number): Terrain => {
  if ((x === MOUNTAIN_A.x && y === MOUNTAIN_A.y) || (x === MOUNTAIN_B.x && y === MOUNTAIN_B.y)) return "MOUNTAIN";
  if (x === SEA_COLUMN_X) return "SEA";
  return "LAND";
};

const regionTypeAtLocal = (x: number): RegionType | undefined => {
  if (x < 5) return "CRYSTAL_WASTES";
  if (x < 10) return "BROKEN_HIGHLANDS";
  if (x < 15) return "DEEP_FOREST";
  if (x >= 15 && x < 20) return "FERTILE_PLAINS";
  if (x >= 20 && x < 24) return "ANCIENT_HEARTLAND";
  return undefined;
};

const landBiomeAt = (x: number): LandBiome | undefined => {
  if (x === SEA_COLUMN_X - 1 || x === SEA_COLUMN_X - 2) return "COASTAL_SAND";
  if (x >= 44) return "GRASS";
  return "SAND";
};

const grassShadeAt = (x: number): "LIGHT" | "DARK" | undefined => (x >= 44 ? "LIGHT" : "DARK");

const buildDeps = () => {
  const naturalWondersByTile = new Map<TileKey, NaturalWonderSiteState>();
  return {
    naturalWondersByTile,
    seeded01: (a: number, b: number, seed: number): number => {
      // Deterministic pseudo-random in [0, 1), stable across calls with the
      // same inputs so a fixed seed always produces the same placement.
      const n = Math.sin(a * 12.9898 + b * 78.233 + seed * 0.001) * 43758.5453;
      return n - Math.floor(n);
    },
    WORLD_WIDTH,
    WORLD_HEIGHT,
    terrainAt,
    regionTypeAtLocal,
    landBiomeAt,
    grassShadeAt,
    key,
    docksByTile: new Map(),
    clusterByTile: new Map<TileKey, string>(),
    clustersById: new Map<string, ClusterDefinition>(),
    townsByTile: new Map()
  };
};

const ALL_WONDER_TYPES: readonly NaturalWonderType[] = [
  "FOUNDRY_HEART",
  "DEEPWATER_ENGINE",
  "CONSCRIPTION_ENGINE",
  "WARPRESS",
  "BASTION_FRAME",
  "CALCULATING_ENGINE",
  "QUICKFORGE",
  "WATCHTOWER_ENGINE",
  "CARTOGRAPHERS_LENS"
];

describe("createServerWorldgenNaturalWonders", () => {
  it("places every wonder type exactly once when the world satisfies all predicates", () => {
    const deps = buildDeps();
    const runtime = createServerWorldgenNaturalWonders(deps);
    runtime.generateNaturalWonders(42);

    const placedTypes = [...deps.naturalWondersByTile.values()].map((site) => site.type);
    expect(new Set(placedTypes).size).toBe(placedTypes.length); // no duplicates
    for (const type of ALL_WONDER_TYPES) {
      expect(placedTypes).toContain(type);
    }
  });

  it("respects each wonder's spawn predicate", () => {
    const deps = buildDeps();
    const runtime = createServerWorldgenNaturalWonders(deps);
    runtime.generateNaturalWonders(42);

    for (const [tileKey, site] of deps.naturalWondersByTile) {
      const [xStr, yStr] = tileKey.split(",");
      const x = Number(xStr);
      const y = Number(yStr);
      expect(terrainAt(x, y)).toBe("LAND");
      switch (site.type) {
        case "FOUNDRY_HEART":
          expect(regionTypeAtLocal(x)).toBe("CRYSTAL_WASTES");
          break;
        case "CONSCRIPTION_ENGINE":
          expect(regionTypeAtLocal(x)).toBe("BROKEN_HIGHLANDS");
          break;
        case "WATCHTOWER_ENGINE":
          expect(regionTypeAtLocal(x)).toBe("DEEP_FOREST");
          break;
        case "WARPRESS":
          expect(regionTypeAtLocal(x)).toBe("FERTILE_PLAINS");
          break;
        case "QUICKFORGE":
          expect(["FERTILE_PLAINS", "ANCIENT_HEARTLAND"]).toContain(regionTypeAtLocal(x));
          break;
        case "CALCULATING_ENGINE":
          expect(landBiomeAt(x)).toBe("GRASS");
          expect(grassShadeAt(x)).toBe("LIGHT");
          break;
        case "DEEPWATER_ENGINE":
          expect(landBiomeAt(x)).toBe("COASTAL_SAND");
          break;
        case "BASTION_FRAME":
        case "CARTOGRAPHERS_LENS":
          // Within Manhattan radius of a mountain tile (3 for Bastion Frame, 2 for Cartographer's Lens).
          expect(
            Math.abs(x - MOUNTAIN_A.x) + Math.abs(y - MOUNTAIN_A.y) <= 3 ||
              Math.abs(x - MOUNTAIN_B.x) + Math.abs(y - MOUNTAIN_B.y) <= 3
          ).toBe(true);
          break;
      }
    }
  });

  it("keeps every pair of placed wonders at least 8 Manhattan tiles apart", () => {
    const deps = buildDeps();
    const runtime = createServerWorldgenNaturalWonders(deps);
    runtime.generateNaturalWonders(42);

    const placements = [...deps.naturalWondersByTile.keys()].map((tileKey) => {
      const [xStr, yStr] = tileKey.split(",");
      return { x: Number(xStr), y: Number(yStr) };
    });
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const a = placements[i]!;
        const b = placements[j]!;
        const dx = Math.min(Math.abs(a.x - b.x), WORLD_WIDTH - Math.abs(a.x - b.x));
        const dy = Math.min(Math.abs(a.y - b.y), WORLD_HEIGHT - Math.abs(a.y - b.y));
        expect(dx + dy).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("omits a wonder gracefully when no tile on the map satisfies its predicate", () => {
    const deps = buildDeps();
    // No CRYSTAL_WASTES region anywhere on this world -> FOUNDRY_HEART must be omitted, not throw.
    deps.regionTypeAtLocal = (x: number) => {
      const region = regionTypeAtLocal(x);
      return region === "CRYSTAL_WASTES" ? undefined : region;
    };
    const runtime = createServerWorldgenNaturalWonders(deps);
    expect(() => runtime.generateNaturalWonders(42)).not.toThrow();

    const placedTypes = [...deps.naturalWondersByTile.values()].map((site) => site.type);
    expect(placedTypes).not.toContain("FOUNDRY_HEART");
    // The rest of the world is unaffected and still gets placed.
    expect(placedTypes).toContain("CONSCRIPTION_ENGINE");
  });

  it("never places a wonder on an occupied tile (dock/cluster/town)", () => {
    const deps = buildDeps();
    // Block off the entire CRYSTAL_WASTES band with docks so FOUNDRY_HEART has nowhere to land.
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        deps.docksByTile.set(key(x, y), { dockId: `dock-${x}-${y}` } as never);
      }
    }
    const runtime = createServerWorldgenNaturalWonders(deps);
    runtime.generateNaturalWonders(42);

    const placedTypes = [...deps.naturalWondersByTile.values()].map((site) => site.type);
    expect(placedTypes).not.toContain("FOUNDRY_HEART");
  });

  it("is idempotent per call: clears prior placements before regenerating", () => {
    const deps = buildDeps();
    const runtime = createServerWorldgenNaturalWonders(deps);
    runtime.generateNaturalWonders(42);
    const firstCount = deps.naturalWondersByTile.size;
    runtime.generateNaturalWonders(42);
    expect(deps.naturalWondersByTile.size).toBe(firstCount);
  });
});

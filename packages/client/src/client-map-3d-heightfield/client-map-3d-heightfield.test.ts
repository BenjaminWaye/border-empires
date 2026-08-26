import { describe, expect, it } from "vitest";
import {
  HEIGHTFIELD_COASTAL_SEA_ELEVATION,
  HEIGHTFIELD_DEEP_SEA_ELEVATION,
  HEIGHTFIELD_GRASS_ELEVATION,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  HEIGHTFIELD_MOUNTAIN_ELEVATION,
  HEIGHTFIELD_SAND_ELEVATION,
  createHeightfield,
  heightfieldTileBaseElevation,
  type HeightfieldTerrainKind
} from "./client-map-3d-heightfield.js";
import { BufferAttribute } from "three";

const WORLD_WIDTH = 450;
const WORLD_HEIGHT = 450;

const buildKindMap = (kinds: ReadonlyArray<ReadonlyArray<HeightfieldTerrainKind>>): ((wx: number, wy: number) => HeightfieldTerrainKind) => {
  return (wx: number, wy: number): HeightfieldTerrainKind => {
    const row = kinds[((wy % kinds.length) + kinds.length) % kinds.length];
    if (!row) return "GRASS";
    return row[((wx % row.length) + row.length) % row.length] ?? "GRASS";
  };
};

const positionsOf = (heightfield: ReturnType<typeof createHeightfield>): Float32Array => {
  const attr = heightfield.geometry.attributes.position as BufferAttribute;
  return attr.array as Float32Array;
};

describe("heightfield base elevations", () => {
  it("orders elevations sea < coastal_sea < sand < grass < mountain", () => {
    const order: HeightfieldTerrainKind[] = ["SEA", "COASTAL_SEA", "SAND", "GRASS", "MOUNTAIN"];
    let prev = -Infinity;
    for (const kind of order) {
      const elev = heightfieldTileBaseElevation(kind);
      expect(elev).toBeGreaterThan(prev);
      prev = elev;
    }
  });

  it("uses the published elevation constants", () => {
    expect(heightfieldTileBaseElevation("SEA")).toBe(HEIGHTFIELD_DEEP_SEA_ELEVATION);
    expect(heightfieldTileBaseElevation("COASTAL_SEA")).toBe(HEIGHTFIELD_COASTAL_SEA_ELEVATION);
    expect(heightfieldTileBaseElevation("SAND")).toBe(HEIGHTFIELD_SAND_ELEVATION);
    expect(heightfieldTileBaseElevation("GRASS")).toBe(HEIGHTFIELD_GRASS_ELEVATION);
    expect(heightfieldTileBaseElevation("MOUNTAIN")).toBe(HEIGHTFIELD_MOUNTAIN_ELEVATION);
  });
});

describe("heightfield mountain ridge averaging", () => {
  it("raises shared corner higher when more mountain neighbours surround it", () => {
    const heightfield = createHeightfield();

    const isolated: HeightfieldTerrainKind[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => "GRASS" as HeightfieldTerrainKind)
    );
    isolated[4]![4] = "MOUNTAIN";

    heightfield.rebuild({
      camX: 0,
      camY: 0,
      halfW: 3,
      halfH: 3,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      tileKindAt: buildKindMap(isolated)
    });
    const isolatedPositions = positionsOf(heightfield).slice();

    const ridge: HeightfieldTerrainKind[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => "GRASS" as HeightfieldTerrainKind)
    );
    ridge[4]![4] = "MOUNTAIN";
    ridge[4]![5] = "MOUNTAIN";
    ridge[5]![4] = "MOUNTAIN";
    ridge[5]![5] = "MOUNTAIN";

    heightfield.rebuild({
      camX: 0,
      camY: 0,
      halfW: 3,
      halfH: 3,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      tileKindAt: buildKindMap(ridge)
    });
    const ridgePositions = positionsOf(heightfield);

    const findMaxY = (positions: Float32Array): number => {
      let maxY = -Infinity;
      for (let i = 1; i < positions.length; i += 3) {
        const y = positions[i]!;
        if (y > maxY) maxY = y;
      }
      return maxY;
    };

    const isolatedMax = findMaxY(isolatedPositions);
    const ridgeMax = findMaxY(ridgePositions);
    expect(ridgeMax).toBeGreaterThan(isolatedMax);
    expect(ridgeMax).toBeGreaterThan(0.5 * HEIGHTFIELD_MOUNTAIN_ELEVATION);
    expect(isolatedMax).toBeLessThan(0.5 * HEIGHTFIELD_MOUNTAIN_ELEVATION);

    heightfield.dispose();
  });

  it("wraps toroidally so a tile at world edge contributes to the opposite seam", () => {
    const heightfield = createHeightfield();
    const tileKindAt = (wx: number, wy: number): HeightfieldTerrainKind => {
      if (wx === WORLD_WIDTH - 1 && wy === 0) return "MOUNTAIN";
      return "GRASS";
    };

    heightfield.rebuild({
      camX: 0,
      camY: 0,
      halfW: 1,
      halfH: 1,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      tileKindAt
    });

    expect(heightfield.elevationAt(WORLD_WIDTH - 1, 0)).toBe(HEIGHTFIELD_MOUNTAIN_ELEVATION);
    heightfield.dispose();
  });
});

describe("heightfield corners deep inside a hills cluster", () => {
  it("does not fall back to the deep-sea-floor placeholder when all 4 neighbours are hills", () => {
    // Regression test: a corner whose 4 surrounding tiles are ALL hills has
    // landCount=0 and seaCount=0 (hills count toward neither category, see
    // client-map-3d-heightfield.ts), which a naive exploredCount =
    // landCount + seaCount would mistake for "nothing explored touches this
    // corner" -- pinning it to the deep-sea-floor placeholder even though
    // every tile is explored land. This is the common case once hills
    // cluster into highland regions (worldgen groups them, per the
    // 2026.07.25.3 changelog entry), not just a contrived edge case.
    const heightfield = createHeightfield();
    const allGrass = (): HeightfieldTerrainKind => "GRASS";
    const allHills = (): boolean => true;

    heightfield.rebuild({
      camX: 0,
      camY: 0,
      halfW: 3,
      halfH: 3,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      tileKindAt: allGrass,
      isHillsAt: allHills
    });

    const cornerY = heightfield.cornerYAt(0, 0);
    expect(cornerY).not.toBeCloseTo(HEIGHTFIELD_DEEP_SEA_ELEVATION, 1);
    // Should land close to grass's own base elevation (the dome's own
    // corner fallback in client-map-3d-hills.ts averages the bonus-free
    // base elevation too, so this corner shouldn't carry the hills bonus).
    expect(cornerY).toBeGreaterThan(HEIGHTFIELD_GRASS_ELEVATION - HEIGHTFIELD_HILLS_ELEVATION_BONUS);
    expect(cornerY).toBeLessThan(HEIGHTFIELD_GRASS_ELEVATION + HEIGHTFIELD_HILLS_ELEVATION_BONUS);

    heightfield.dispose();
  });
});

describe("heightfield coastal hill corners", () => {
  it("does not flatten a coastal hill's corner to beach level", () => {
    // Regression test: a corner touching both sea and a hill tile was
    // unconditionally pinned to coastEdgeY (beach height), same as a flat
    // coastline, ignoring the hill entirely. That sank anything anchored via
    // cornerYAt -- notably the ownership overlay's draped hill tint -- below
    // the hill dome's visible surface, making a settled coastal hill (the
    // common case, since FISH resources spawn on coastal land) look
    // uncovered even though it was fully owned.
    const heightfield = createHeightfield();
    const kinds: HeightfieldTerrainKind[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => "SAND" as HeightfieldTerrainKind)
    );
    kinds[4]![5] = "SEA";

    heightfield.rebuild({
      camX: 0,
      camY: 0,
      halfW: 3,
      halfH: 3,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      tileKindAt: buildKindMap(kinds),
      isHillsAt: (wx, wy) => wx === 4 && wy === 4
    });

    const cornerY = heightfield.cornerYAt(5, 5);
    // The buggy behaviour pinned this corner to coastEdgeY (-0.04) regardless
    // of the hill. A fixed corner tapers to close to SAND's own base
    // elevation (0.07, +/- jitter), clearly above that beach pin.
    expect(cornerY).toBeGreaterThan(0.02);

    heightfield.dispose();
  });
});

describe("heightfield coastal skirt", () => {
  it("emits skirt geometry along a land/sea boundary and none for all-land", () => {
    const heightfield = createHeightfield();

    const coastal: HeightfieldTerrainKind[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => "GRASS" as HeightfieldTerrainKind)
    );
    for (let i = 0; i < 9; i += 1) coastal[8]![i] = "SEA";

    heightfield.rebuild({
      camX: 0,
      camY: 0,
      halfW: 3,
      halfH: 3,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      tileKindAt: buildKindMap(coastal)
    });
    expect(heightfield.skirtMesh.geometry.drawRange.count).toBeGreaterThan(0);

    const allLand: HeightfieldTerrainKind[][] = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => "GRASS" as HeightfieldTerrainKind)
    );
    heightfield.rebuild({
      camX: 0,
      camY: 0,
      halfW: 3,
      halfH: 3,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      tileKindAt: buildKindMap(allLand)
    });
    expect(heightfield.skirtMesh.geometry.drawRange.count).toBe(0);

    heightfield.dispose();
  });
});

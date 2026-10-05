import { describe, expect, it } from "vitest";
import { computeHeightfieldCorner, type HeightfieldCornerOut, type HeightfieldTileSample } from "./client-map-3d-heightfield-corners.js";
import { createFlatCornerResolver } from "../client-map-3d-hills-corner.js";
import {
  heightfieldFlatTileElevation,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  type HeightfieldTerrainKind
} from "../client-map-3d-heightfield-terrain.js";

// Regression: a grid corner touching only hills + sea (no flat land) used to
// average the sea-floor elevation into cornerYAt, sinking it ~0.15-0.4 below
// the hill dome's own coast-pinned edge. Every overlay anchored on cornerYAt
// for that hill tile (ownership tint, settle progress, fog) was then drawn
// under the dome and depth-tested away -- the "can't paint ownership on hills
// near the water" bug. The main grid and the dome must agree on every corner
// a hill tile owns.

const WORLD = 64;
const wrap = (n: number, dim: number): number => ((n % dim) + dim) % dim;
const HILL = { x: 10, y: 10 };
// Corner (11, 11) is shared by tiles (10,10), (11,10), (10,11), (11,11).
const CORNER = { x: 11, y: 11 };

const isSeaKind = (kind: HeightfieldTerrainKind): boolean => kind === "SEA" || kind === "COASTAL_SEA";

const cornerHeights = (
  kinds: Readonly<Record<string, HeightfieldTerrainKind>>,
  hills: ReadonlySet<string>
): { mainGrid: number; dome: number } => {
  const tileKindAt = (x: number, y: number): HeightfieldTerrainKind => kinds[`${x},${y}`] ?? "GRASS";
  const isHillsAt = (x: number, y: number): boolean => hills.has(`${x},${y}`);
  // Mirrors client-map-3d-heightfield.ts's sampleTile.
  const sample = (x: number, y: number): HeightfieldTileSample => {
    const kind = tileKindAt(x, y);
    const isHills = !isSeaKind(kind) && kind !== "MOUNTAIN" && isHillsAt(x, y);
    return {
      elevation: heightfieldFlatTileElevation(x, y, kind) + (isHills ? HEIGHTFIELD_HILLS_ELEVATION_BONUS : 0),
      r: 0,
      g: 0,
      b: 0,
      isSea: isSeaKind(kind),
      isExplored: true,
      isHills,
      isTundra: false,
      forestProx: 0
    };
  };
  const out: HeightfieldCornerOut = { elevation: 0, r: 0, g: 0, b: 0 };
  computeHeightfieldCorner(
    out,
    sample(CORNER.x - 1, CORNER.y - 1),
    sample(CORNER.x, CORNER.y - 1),
    sample(CORNER.x - 1, CORNER.y),
    sample(CORNER.x, CORNER.y),
    CORNER.x,
    CORNER.y
  );
  const flatCorner = createFlatCornerResolver({ worldWidth: WORLD, worldHeight: WORLD, wrap, tileKindAt, exploredAt: () => true, isHillsAt });
  const dome = flatCorner(CORNER.x, CORNER.y, { e: 0, r: 0, g: 0, b: 0, t: 0 }).e;
  return { mainGrid: out.elevation, dome };
};

const ONE_HILL = new Set([`${HILL.x},${HILL.y}`]);

describe("heightfield corner matches the hill dome at coastal hill corners", () => {
  it.each<[string, Record<string, HeightfieldTerrainKind>, ReadonlySet<string>]>([
    ["hill + 3 coastal sea", { "11,10": "COASTAL_SEA", "10,11": "COASTAL_SEA", "11,11": "COASTAL_SEA" }, ONE_HILL],
    ["hill + 3 deep sea", { "11,10": "SEA", "10,11": "SEA", "11,11": "SEA" }, ONE_HILL],
    ["2 hills + 2 coastal sea", { "10,11": "COASTAL_SEA", "11,11": "COASTAL_SEA" }, new Set(["10,10", "11,10"])],
    ["3 hills + 1 sea", { "11,11": "SEA" }, new Set(["10,10", "11,10", "10,11"])],
    ["hill + grass + 2 coastal sea", { "10,11": "COASTAL_SEA", "11,11": "COASTAL_SEA" }, ONE_HILL],
    ["inland hill", {}, ONE_HILL]
  ])("%s", (_label, kinds, hills) => {
    const { mainGrid, dome } = cornerHeights(kinds, hills);
    expect(mainGrid).toBeCloseTo(dome, 5);
  });

  it("keeps a hills-only corner (no sea) at the hills' bonus-free base", () => {
    const { mainGrid, dome } = cornerHeights({}, new Set(["10,10", "11,10", "10,11", "11,11"]));
    expect(mainGrid).toBeCloseTo(dome, 5);
  });

  it("leaves a sea-only corner at the sea floor (no hill to drape over it)", () => {
    const { mainGrid } = cornerHeights({ "10,10": "SEA", "11,10": "SEA", "10,11": "SEA", "11,11": "SEA" }, new Set());
    expect(mainGrid).toBeCloseTo(heightfieldFlatTileElevation(0, 0, "SEA"), 5);
  });
});

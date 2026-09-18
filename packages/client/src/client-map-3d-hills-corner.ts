import { terrainShadeVariantAt, coastWobbleAt } from "./client-map-3d-terrain-variation/client-map-3d-terrain-variation.js";
import {
  heightfieldFlatTileElevation,
  heightfieldTileColor,
  coastCornerElevationWobbled,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  COAST_EDGE_Y,
  type HeightfieldTerrainKind
} from "./client-map-3d-heightfield/client-map-3d-heightfield.js";

export type FlatCornerValue = { e: number; r: number; g: number; b: number; t: number };

export type FlatCornerResolverDeps = {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly wrap: (n: number, dim: number) => number;
  readonly tileKindAt: (wx: number, wy: number) => HeightfieldTerrainKind;
  readonly exploredAt: (wx: number, wy: number) => boolean;
  readonly isHillsAt: (wx: number, wy: number) => boolean;
};

const CORNER_OFFSETS = [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const;

// Pulled out of client-map-3d-hills.ts (which sits at the repo's 500-line
// file cap) — the single place a hill dome's edge corner elevation/colour is
// resolved so it lines up with the main grid's own corner exactly, including
// the main grid's coastal-corner pin (see the touchesSea branch below).
export const createFlatCornerResolver = (
  deps: FlatCornerResolverDeps
): ((cx: number, cz: number, fallback: FlatCornerValue) => FlatCornerValue) => {
  const { worldWidth, worldHeight, wrap, tileKindAt, exploredAt, isHillsAt } = deps;

  // A neighbour only counts toward a shared corner's flat value if the main
  // grid would also count it there: explored, not sea, not itself a hills
  // tile (mirrors that grid's s00Land predicate exactly).
  const countsAsFlatLand = (nwx: number, nwy: number): boolean => {
    if (!exploredAt(nwx, nwy)) return false;
    const nk = tileKindAt(nwx, nwy);
    if (nk === "SEA" || nk === "COASTAL_SEA") return false;
    if (nk !== "MOUNTAIN" && isHillsAt(nwx, nwy)) return false;
    return true;
  };

  // Real ground elevation/colour at world grid corner (cx, cz), averaged
  // over whichever of its 4 tiles count as flat land — the exact value the
  // main grid renders there, so a dome edge lines up with no seam.
  //
  // `fallback` is this dome's *own* tile's elevation/colour, used only if
  // count is still 0 after both loops below. In practice this dome's own
  // tile is always one of the 4 cells the second loop checks at each of its
  // 4 corners, and the caller already requires exploredAt(wx, wy) to be
  // true to reach this point at all — so that second loop always finds at
  // least this tile itself, and count never actually reaches 0 for a hill's
  // own corners today. Kept anyway as defensive correctness.
  return (cx, cz, fallback) => {
    let sumE = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumT = 0;
    let count = 0;
    // A corner touching an explored sea tile also gets pinned toward
    // COAST_EDGE_Y in the main grid (coastCornerElevation), not just
    // averaged with its flat-land neighbours — sea is never a
    // countsAsFlatLand neighbour, so the loop below never sees it. Without
    // this, a corner where a hill meets the coast keeps whatever plain
    // land-average height its other neighbours give it while the main
    // grid's own corner right next to it gets pulled down to the coast
    // pin, and the two disagree: the dome edge sits above the real coast
    // level and its underside/skirt shows through as a black seam.
    const coastCells: Array<{ elevation: number; isExplored: boolean; isHills: boolean }> = [];
    let touchesSea = false;
    for (const [dx, dz] of CORNER_OFFSETS) {
      const nwx = wrap(cx + dx, worldWidth);
      const nwz = wrap(cz + dz, worldHeight);
      if (!exploredAt(nwx, nwz)) {
        coastCells.push({ elevation: 0, isExplored: false, isHills: false });
        continue;
      }
      const nk = tileKindAt(nwx, nwz);
      const isSea = nk === "SEA" || nk === "COASTAL_SEA";
      if (isSea) touchesSea = true;
      const isHillsN = nk !== "MOUNTAIN" && isHillsAt(nwx, nwz);
      coastCells.push({
        elevation: heightfieldFlatTileElevation(nwx, nwz, nk) + (isHillsN ? HEIGHTFIELD_HILLS_ELEVATION_BONUS : 0),
        isExplored: true,
        isHills: isHillsN
      });
      if (!countsAsFlatLand(nwx, nwz)) continue;
      const [nr, ng, nb] = heightfieldTileColor(nk, terrainShadeVariantAt(nwx, nwz));
      sumE += heightfieldFlatTileElevation(nwx, nwz, nk);
      sumR += nr / 255; sumG += ng / 255; sumB += nb / 255;
      sumT += nk === "TUNDRA" || nk === "SNOW" ? 1 : 0;
      count += 1;
    }
    if (count === 0) {
      // No flat-land neighbour at all (deep inside a hills cluster) — fall
      // back to whatever explored tiles do touch it, so at least every
      // hill touching this corner agrees with the others.
      for (const [dx, dz] of CORNER_OFFSETS) {
        const nwx = wrap(cx + dx, worldWidth);
        const nwz = wrap(cz + dz, worldHeight);
        if (!exploredAt(nwx, nwz)) continue;
        const nk = tileKindAt(nwx, nwz);
        const [nr, ng, nb] = heightfieldTileColor(nk, terrainShadeVariantAt(nwx, nwz));
        sumE += heightfieldFlatTileElevation(nwx, nwz, nk);
        sumR += nr / 255; sumG += ng / 255; sumB += nb / 255;
        sumT += nk === "TUNDRA" || nk === "SNOW" ? 1 : 0;
        count += 1;
      }
    }
    if (count === 0) return fallback;
    const inv = 1 / count;
    let e = sumE * inv;
    if (touchesSea) {
      const wobble = coastWobbleAt(cx, cz);
      e = coastCornerElevationWobbled(coastCells[0]!, coastCells[1]!, coastCells[2]!, coastCells[3]!, COAST_EDGE_Y, wobble);
    }
    return { e, r: sumR * inv, g: sumG * inv, b: sumB * inv, t: sumT * inv };
  };
};

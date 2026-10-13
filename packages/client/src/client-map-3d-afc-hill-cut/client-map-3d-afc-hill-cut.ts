// AFC hill cut (true-3D renderer only). The Automated Fabrication Complex is
// placed at its own tile's height, but its socket ring, ground cables,
// manipulator claws and docked modules reach ~1.3 tiles out -- right over the
// centres of its 8 neighbours, which is exactly where a neighbouring hill
// dome peaks. Without this cut those pieces sank into the dome.
//
// Like a road (hillRoadCutMask), the AFC carves a levelled pad through the
// hill domes around it: hillShapeHeight is flattened to ground level within
// AFC_HILL_CUT_FULL_RADIUS of the AFC centre, fading back to the normal dome
// by AFC_HILL_CUT_FADE_RADIUS, so the far side of a diagonal neighbour still
// reads as a hill rising behind the complex. Purely visual: the tile stays a
// hills tile for vision/claim rules, the same way the landing already clears
// forest and flattens mountains in its 3x3 footprint.
//
// The pad offsets ride on the per-tile RoadCutDirections every hill drape
// already receives (dome mesh, tile surface Y, roads, ownership/fog/prospect
// drapes), so all of them trace the same cut surface.
import type { RoadCutDirections } from "../client-map-3d-hill-shape.js";

/** Offset (tiles) from a hill tile's centre to an AFC centre whose pad cuts through it. */
export type AfcPadOffset = { readonly du: number; readonly dv: number };

// The socket pads reach AFC_SOCKET_RING_RADIUS (1.28) + pad radius (0.21)
// = 1.49 from the AFC centre; this keeps the dome to a sliver there and the
// docked modules/claws (all inside the ring) on flat ground.
export const AFC_HILL_CUT_FULL_RADIUS = 1.45;
export const AFC_HILL_CUT_FADE_RADIUS = 1.8;
// Chebyshev tile radius the fade reaches into (a tile centred d tiles away
// spans d +- 0.5). Every hill tile in it gets the pad -- not just the 3x3
// footprint -- because the mask is one continuous function of distance from
// the AFC centre: a footprint tile cut at its outer edge must meet a dome
// outside the footprint that is cut by the same amount there, or the hill
// steps up at the shared border.
export const AFC_HILL_CUT_TILE_RADIUS = Math.ceil(AFC_HILL_CUT_FADE_RADIUS - 0.5);

/** 0..1 strength of the AFC pad cut at tile-local (u, v) (origin at the hill tile's centre). */
export const afcHillCutMask = (u: number, v: number, pads: readonly AfcPadOffset[] | undefined): number => {
  if (!pads || pads.length === 0) return 0;
  let best = 0;
  for (const pad of pads) {
    const d = Math.hypot(u - pad.du, v - pad.dv);
    if (d <= AFC_HILL_CUT_FULL_RADIUS) return 1;
    if (d >= AFC_HILL_CUT_FADE_RADIUS) continue;
    const t = 1 - (d - AFC_HILL_CUT_FULL_RADIUS) / (AFC_HILL_CUT_FADE_RADIUS - AFC_HILL_CUT_FULL_RADIUS);
    const mask = t * t * (3 - 2 * t);
    if (mask > best) best = mask;
  }
  return best;
};

export type AfcPadIndexDeps = {
  readonly tiles: Iterable<{ readonly x: number; readonly y: number; readonly afc?: unknown }>;
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  // An AFC the join drop is still hiding keeps its original terrain until
  // touchdown (see isInHeldAfcLandingFootprint), so it cuts nothing yet.
  readonly isAfcHiddenAt: (x: number, y: number) => boolean;
};

/**
 * Tile key -> pad offsets for every tile within AFC_HILL_CUT_TILE_RADIUS of
 * some AFC. Built once per terrain rebuild and dropped with it; at most 25
 * entries per AFC.
 */
export const buildAfcPadIndex = (deps: AfcPadIndexDeps): Map<string, AfcPadOffset[]> => {
  const index = new Map<string, AfcPadOffset[]>();
  const r = AFC_HILL_CUT_TILE_RADIUS;
  for (const tile of deps.tiles) {
    if (!tile.afc || deps.isAfcHiddenAt(tile.x, tile.y)) continue;
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        const key = deps.keyFor(deps.wrapX(tile.x + dx), deps.wrapY(tile.y + dy));
        // The tile sits at (dx, dy) from the AFC, so the AFC centre
        // is at (-dx, -dy) from the footprint tile's own centre.
        const pad: AfcPadOffset = { du: 0 - dx, dv: 0 - dy }; // 0 - d, not -d: no -0 for the AFC tile itself
        const pads = index.get(key);
        if (pads) pads.push(pad);
        else index.set(key, [pad]);
      }
    }
  }
  return index;
};

/**
 * The per-tile hill cut every hill drape should use: the tile's road cut
 * directions plus any AFC pads through it. Road *drawing* must keep using the
 * raw road lookup -- a tile with only an AFC pad has no road.
 */
export const createHillCutLookup = (
  roadDirsAt: (x: number, y: number) => RoadCutDirections | undefined,
  afcPads: ReadonlyMap<string, readonly AfcPadOffset[]>,
  keyFor: (x: number, y: number) => string
): ((x: number, y: number) => RoadCutDirections | undefined) => {
  if (afcPads.size === 0) return roadDirsAt;
  // Hill drapes query per vertex/road point, so merge each footprint tile
  // once; bounded by the pad index (25 entries per AFC), dropped with it.
  const merged = new Map<string, RoadCutDirections>();
  return (x, y) => {
    const key = keyFor(x, y);
    const pads = afcPads.get(key);
    if (!pads) return roadDirsAt(x, y);
    let cut = merged.get(key);
    if (!cut) {
      cut = { ...roadDirsAt(x, y), afcPads: pads };
      merged.set(key, cut);
    }
    return cut;
  };
};

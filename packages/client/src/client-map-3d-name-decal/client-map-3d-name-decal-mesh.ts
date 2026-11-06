// Ground mesh the name decal's canvas is laid on. Flat tiles use a coarse
// 2x2 grid (corners, edge midpoints, centre); hill tiles use the same
// 10x10 grid the terrain dome and the ownership drape use
// (client-map-3d-ownership-overlay.ts, HILL_SUBDIV), sampling the dome per
// vertex. A coarse grid over a hill is a tent that sits below the dome's
// bumps, so the depth test hid the lettering inside the hill.

/** Corner lift above the heightfield; matches client-map-3d.ts's OVERLAY_RISE_ABOVE_HEIGHTFIELD. */
export const CORNER_RISE = 0.012;
/** Quads per flat-tile edge (corners, edge midpoints, centre). */
export const FLAT_SUBDIVISIONS = 2;
/** Quads per hill-tile edge: matches the terrain dome's own resolution. */
export const HILL_SUBDIVISIONS = 10;

/** Dome height above ground at tile-local (u, v) in [-0.5, 0.5], or undefined for a non-hill tile. */
export type HillDomeSampler = (u: number, v: number) => number;

export type DecalMeshSource = {
  readonly cornerYAt: (wx: number, wy: number) => number;
  readonly tileCenterY: (wx: number, wy: number) => number;
  /** Per-tile dome sampler; undefined for tiles that are not hills. */
  readonly hillDomeAt?: ((wx: number, wy: number) => HillDomeSampler | undefined) | undefined;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
};

export type DecalMeshWindow = {
  /** Unwrapped world tile of the window's first tile. */
  readonly firstTileX: number;
  readonly firstTileY: number;
  readonly tilesX: number;
  readonly tilesZ: number;
  /** Scene-space offset of the window's first tile. */
  readonly originDx: number;
  readonly originDy: number;
  /** Canvas-area offset of the window's first tile, in tiles, and the canvas size in tiles. */
  readonly areaOffsetX: number;
  readonly areaOffsetY: number;
  readonly areaWidthTiles: number;
  readonly areaHeightTiles: number;
};

export type DecalMeshArrays = { readonly positions: Float32Array; readonly uvs: Float32Array; readonly indices: Uint32Array };

/** One independent vertex block per tile, so a hill tile can be finer than its flat neighbours. */
export const buildDecalMeshArrays = (source: DecalMeshSource, window: DecalMeshWindow): DecalMeshArrays => {
  const { wrapX, wrapY } = source;
  const flatVerts = (FLAT_SUBDIVISIONS + 1) ** 2;
  const hillVerts = (HILL_SUBDIVISIONS + 1) ** 2;
  const hillDomes: Array<HillDomeSampler | undefined> = [];
  let totalVerts = 0;
  let totalQuads = 0;
  for (let tz = 0; tz < window.tilesZ; tz += 1) {
    for (let tx = 0; tx < window.tilesX; tx += 1) {
      const dome = source.hillDomeAt?.(wrapX(window.firstTileX + tx), wrapY(window.firstTileY + tz));
      hillDomes.push(dome);
      totalVerts += dome ? hillVerts : flatVerts;
      totalQuads += (dome ? HILL_SUBDIVISIONS : FLAT_SUBDIVISIONS) ** 2;
    }
  }
  const positions = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = new Uint32Array(totalQuads * 6);
  let vertex = 0;
  let index = 0;
  for (let tz = 0; tz < window.tilesZ; tz += 1) {
    for (let tx = 0; tx < window.tilesX; tx += 1) {
      const wx = wrapX(window.firstTileX + tx);
      const wy = wrapY(window.firstTileY + tz);
      const dome = hillDomes[tz * window.tilesX + tx];
      const subdivisions = dome ? HILL_SUBDIVISIONS : FLAT_SUBDIVISIONS;
      const c00 = source.cornerYAt(wx, wy);
      const c10 = source.cornerYAt(wrapX(wx + 1), wy);
      const c01 = source.cornerYAt(wx, wrapY(wy + 1));
      const c11 = source.cornerYAt(wrapX(wx + 1), wrapY(wy + 1));
      const centerY = dome ? 0 : source.tileCenterY(wx, wy);
      const base = vertex;
      for (let b = 0; b <= subdivisions; b += 1) {
        for (let a = 0; a <= subdivisions; a += 1) {
          const fx = a / subdivisions;
          const fz = b / subdivisions;
          const ground = c00 * (1 - fx) * (1 - fz) + c10 * fx * (1 - fz) + c01 * (1 - fx) * fz + c11 * fx * fz;
          let y: number;
          if (dome) y = ground + dome(fx - 0.5, fz - 0.5) + CORNER_RISE;
          else if (a === 1 && b === 1) y = centerY;
          else y = ground + CORNER_RISE;
          const localX = tx + fx;
          const localZ = tz + fz;
          positions[vertex * 3] = window.originDx + localX;
          positions[vertex * 3 + 1] = y;
          positions[vertex * 3 + 2] = window.originDy + localZ;
          uvs[vertex * 2] = (window.areaOffsetX + localX) / window.areaWidthTiles;
          uvs[vertex * 2 + 1] = 1 - (window.areaOffsetY + localZ) / window.areaHeightTiles;
          vertex += 1;
        }
      }
      const row = subdivisions + 1;
      for (let b = 0; b < subdivisions; b += 1) {
        for (let a = 0; a < subdivisions; a += 1) {
          const p = base + b * row + a;
          indices[index] = p;
          indices[index + 1] = p + row;
          indices[index + 2] = p + 1;
          indices[index + 3] = p + 1;
          indices[index + 4] = p + row;
          indices[index + 5] = p + row + 1;
          index += 6;
        }
      }
    }
  }
  return { positions, uvs, indices };
};

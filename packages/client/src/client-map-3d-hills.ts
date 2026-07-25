import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene
} from "three";
import { terrainShadeVariantAt } from "./client-map-3d-terrain-variation/client-map-3d-terrain-variation.js";
import {
  heightfieldFlatTileElevation,
  heightfieldTileColor,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  type HeightfieldTerrainKind
} from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import { accumulateHeightfieldNormals } from "./client-map-3d-heightfield-normals.js";

// Hills tiles are excluded entirely from the shared-vertex heightfield grid
// (see isHillsAt in client-map-3d-heightfield.ts) — that grid's corner
// averaging would otherwise dilute a lone hills tile's rise to ~1/4 height
// and bleed it into flat neighbours. Instead every hills tile gets its own
// small, independently-subdivided dome mesh, confined to that tile's
// footprint: height follows a smooth radial falloff that peaks at the
// centre and reaches ground level before it ever touches the tile's edges.
//
// Every attribute at the dome's edge is *stitched* to the main grid's real
// data instead of invented locally — same technique used to blend any
// decoration mesh into a base terrain seamlessly:
//  - height: bilinear-blended from the tile's real 4 corner elevations
//    (heightfieldFlatTileElevation), so it matches flat/jittered neighbours
//    exactly, and blends toward sand/grass/etc. the same way the main grid
//    would if this tile weren't a hill.
//  - colour: bilinear-blended from the tile's real 4 corner colours
//    (heightfieldTileColor + terrainShadeVariantAt) the same way, so a hill
//    sitting near a grass/sand border fades correctly instead of showing
//    one fixed biome tint for its whole footprint.
//  - normals: computed by the same bounded accumulator the main grid uses
//    (accumulateHeightfieldNormals), never three.js's own
//    computeVertexNormals(), which ignores drawRange and corrupts normals
//    with stale data from the rest of a mostly-unused preallocated buffer.
//  - material: the *exact same* MeshStandardMaterial instance as the main
//    heightfield (passed in, not created here), so the painted grass/sand
//    textures, normal map and lighting all match exactly. That shared
//    shader expects a world-tile-coordinate `uv` and a `forestZone`
//    attribute (see its onBeforeCompile), both provided below even though
//    hill tops don't participate in the forest halo.
const SUBDIV = 10;
const DOME_RADIUS = 0.46;
const CORE_RADIUS = 0.14;

const hillPeakBonus = (): number => HEIGHTFIELD_HILLS_ELEVATION_BONUS;

// Flat plateau of 1 out to CORE_RADIUS (a pure single-point peak always
// reads as a cone tip), then a smoothstep shoulder to 0 at DOME_RADIUS —
// comfortably inside the tile's own edges (0.5) and corners (~0.707), so
// the dome never touches the tile boundary at full height.
const domeFalloff = (r: number): number => {
  if (r <= CORE_RADIUS) return 1;
  const t = Math.min(1, Math.max(0, 1 - (r - CORE_RADIUS) / (DOME_RADIUS - CORE_RADIUS)));
  return t * t * (3 - 2 * t);
};

const wrap = (n: number, dim: number): number => {
  const m = n % dim;
  return m < 0 ? m + dim : m;
};

export type HillTerrainRebuildInputs = {
  readonly camX: number;
  readonly camY: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly tileKindAt: (wx: number, wy: number) => HeightfieldTerrainKind;
  readonly isExploredAt?: (wx: number, wy: number) => boolean;
  readonly isHillsAt: (wx: number, wy: number) => boolean;
};

export type HillTerrain = {
  readonly mesh: Mesh;
  readonly rebuild: (inputs: HillTerrainRebuildInputs) => void;
  readonly dispose: () => void;
};

// `sharedMaterial` must be the main heightfield's own material instance —
// see the module comment above.
export const createHillTerrain = (scene: Scene, maxTiles: number, sharedMaterial: MeshStandardMaterial): HillTerrain => {
  const vertsPerTile = (SUBDIV + 1) * (SUBDIV + 1);
  const indicesPerTile = SUBDIV * SUBDIV * 6;
  const positions = new Float32Array(maxTiles * vertsPerTile * 3);
  const colors = new Float32Array(maxTiles * vertsPerTile * 3);
  const uvs = new Float32Array(maxTiles * vertsPerTile * 2);
  const forestZones = new Float32Array(maxTiles * vertsPerTile);
  // Own normals buffer, filled by accumulateHeightfieldNormals (bounded by
  // the *actual* index count) — never geometry.computeVertexNormals(),
  // which walks the whole preallocated index attribute regardless of
  // setDrawRange() and corrupts real vertices with stale/degenerate data.
  const normals = new Float32Array(maxTiles * vertsPerTile * 3);
  const indices = new Uint32Array(maxTiles * indicesPerTile);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute("forestZone", new BufferAttribute(forestZones, 1));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const mesh = new Mesh(geometry, sharedMaterial);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const rebuild = (inputs: HillTerrainRebuildInputs): void => {
    const { camX, camY, halfW, halfH, worldWidth, worldHeight, tileKindAt, isExploredAt, isHillsAt } = inputs;
    const exploredAt = isExploredAt ?? ((): boolean => true);

    let vertCount = 0;
    let idxCount = 0;

    const spanX = Math.max(2, 2 * halfW + 3);
    const spanY = Math.max(2, 2 * halfH + 3);
    const offsetX = -Math.floor(spanX / 2);
    const offsetY = -Math.floor(spanY / 2);

    // A neighbour only counts toward a shared corner's flat value if the
    // main grid would also count it there: explored, not sea, not itself a
    // hills tile (mirrors that grid's s00Land predicate exactly).
    const countsAsFlatLand = (nwx: number, nwy: number): boolean => {
      if (!exploredAt(nwx, nwy)) return false;
      const nk = tileKindAt(nwx, nwy);
      if (nk === "SEA" || nk === "COASTAL_SEA") return false;
      if ((nk === "GRASS" || nk === "SAND") && isHillsAt(nwx, nwy)) return false;
      return true;
    };
    // Real ground elevation/colour at world grid corner (cx, cz), averaged
    // over whichever of its 4 tiles count as flat land — the exact value
    // the main grid renders there, so a dome edge lines up with no seam.
    const flatCorner = (cx: number, cz: number): { e: number; r: number; g: number; b: number } => {
      let sumE = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
        const nwx = wrap(cx + dx, worldWidth);
        const nwz = wrap(cz + dz, worldHeight);
        if (!countsAsFlatLand(nwx, nwz)) continue;
        const nk = tileKindAt(nwx, nwz);
        const [nr, ng, nb] = heightfieldTileColor(nk, terrainShadeVariantAt(nwx, nwz));
        sumE += heightfieldFlatTileElevation(nwx, nwz, nk);
        sumR += nr / 255; sumG += ng / 255; sumB += nb / 255;
        count += 1;
      }
      if (count === 0) {
        // No flat-land neighbour at all (deep inside a hills cluster) —
        // fall back to whatever explored tiles do touch it, so at least
        // every hill touching this corner agrees with the others.
        for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
          const nwx = wrap(cx + dx, worldWidth);
          const nwz = wrap(cz + dz, worldHeight);
          if (!exploredAt(nwx, nwz)) continue;
          const nk = tileKindAt(nwx, nwz);
          const [nr, ng, nb] = heightfieldTileColor(nk, terrainShadeVariantAt(nwx, nwz));
          sumE += heightfieldFlatTileElevation(nwx, nwz, nk);
          sumR += nr / 255; sumG += ng / 255; sumB += nb / 255;
          count += 1;
        }
      }
      if (count === 0) return { e: 0, r: 0, g: 0, b: 0 };
      const inv = 1 / count;
      return { e: sumE * inv, r: sumR * inv, g: sumG * inv, b: sumB * inv };
    };

    for (let dj = 0; dj < spanY; dj += 1) {
      for (let di = 0; di < spanX; di += 1) {
        const wx = wrap(camX + offsetX + di, worldWidth);
        const wy = wrap(camY + offsetY + dj, worldHeight);
        if (!exploredAt(wx, wy)) continue;
        const kind = tileKindAt(wx, wy);
        if ((kind !== "GRASS" && kind !== "SAND") || !isHillsAt(wx, wy)) continue;
        if (vertCount + vertsPerTile > maxTiles * vertsPerTile || idxCount + indicesPerTile > indices.length) continue;

        const peak = hillPeakBonus();
        const tileX = offsetX + di;
        const tileZ = offsetY + dj;
        // This tile's 4 real corner values (height + colour), matching
        // the main grid exactly.
        const cTL = flatCorner(wx, wy);
        const cTR = flatCorner(wx + 1, wy);
        const cBL = flatCorner(wx, wy + 1);
        const cBR = flatCorner(wx + 1, wy + 1);

        const base = vertCount;
        for (let b = 0; b <= SUBDIV; b += 1) {
          for (let a = 0; a <= SUBDIV; a += 1) {
            const u = a / SUBDIV - 0.5;
            const v = b / SUBDIV - 0.5;
            const r = Math.hypot(u, v);
            const fx = u + 0.5;
            const fz = v + 0.5;
            // Bilinear blend of the 4 real corners, for both height and
            // colour, then the dome bump added on top of the ground level.
            const eTop = cTL.e + (cTR.e - cTL.e) * fx;
            const eBottom = cBL.e + (cBR.e - cBL.e) * fx;
            const groundY = eTop + (eBottom - eTop) * fz;
            const rTop = cTL.r + (cTR.r - cTL.r) * fx;
            const rBottom = cBL.r + (cBR.r - cBL.r) * fx;
            const cr = rTop + (rBottom - rTop) * fz;
            const gTop = cTL.g + (cTR.g - cTL.g) * fx;
            const gBottom = cBL.g + (cBR.g - cBL.g) * fx;
            const cg = gTop + (gBottom - gTop) * fz;
            const bTop = cTL.b + (cTR.b - cTL.b) * fx;
            const bBottom = cBL.b + (cBR.b - cBL.b) * fx;
            const cb = bTop + (bBottom - bTop) * fz;

            const vi = vertCount;
            const p = vi * 3;
            positions[p + 0] = tileX + 0.5 + u;
            positions[p + 1] = groundY + peak * domeFalloff(r);
            positions[p + 2] = tileZ + 0.5 + v;
            colors[p + 0] = cr;
            colors[p + 1] = cg;
            colors[p + 2] = cb;
            // World-tile-coordinate UV (matches the main heightfield's
            // convention) so the shared material's painted texture blend
            // samples the same painterly grass/sand look, not a flat tint.
            const uvi = vi * 2;
            uvs[uvi + 0] = camX + tileX + 0.5 + u;
            uvs[uvi + 1] = camY + tileZ + 0.5 + v;
            vertCount += 1;
          }
        }
        for (let b = 0; b < SUBDIV; b += 1) {
          for (let a = 0; a < SUBDIV; a += 1) {
            const rowStride = SUBDIV + 1;
            const i0 = base + b * rowStride + a;
            const i1 = i0 + 1;
            const i2 = i0 + rowStride;
            const i3 = i2 + 1;
            indices[idxCount++] = i0;
            indices[idxCount++] = i2;
            indices[idxCount++] = i1;
            indices[idxCount++] = i1;
            indices[idxCount++] = i2;
            indices[idxCount++] = i3;
          }
        }
      }
    }

    accumulateHeightfieldNormals(positions, indices, idxCount, normals, vertCount);

    const posAttr = geometry.getAttribute("position");
    const colorAttr = geometry.getAttribute("color");
    const uvAttr = geometry.getAttribute("uv");
    const normalAttr = geometry.getAttribute("normal");
    if (posAttr) (posAttr as BufferAttribute).needsUpdate = true;
    if (colorAttr) (colorAttr as BufferAttribute).needsUpdate = true;
    if (uvAttr) (uvAttr as BufferAttribute).needsUpdate = true;
    if (normalAttr) (normalAttr as BufferAttribute).needsUpdate = true;
    const indexAttr = geometry.index;
    if (indexAttr) indexAttr.needsUpdate = true;
    geometry.setDrawRange(0, idxCount);
  };

  // sharedMaterial is owned (and disposed) by the main heightfield, not
  // this module.
  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
  };

  return { mesh, rebuild, dispose };
};

import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial
} from "three";
import { legacy3DTerrainPalette } from "./client-map-3d-terrain-textures.js";
import { terrainShadeVariantAt } from "./client-map-3d-terrain-variation.js";

export type HeightfieldTerrainKind = "GRASS" | "SAND" | "MOUNTAIN" | "COASTAL_SEA" | "SEA";

// Each rebuild passes per-tile kind for the visible window. A vertex shared by N
// adjacent tiles takes the mean of those tiles' elevations and colors, so two
// neighbouring mountain tiles raise their shared edge to a continuous ridge
// while a lone mountain tile only swells to ~25% height (visually completed by
// the mountain massif peak in commit 3).
export const HEIGHTFIELD_MAX_TILES_PER_AXIS = 240;
const VERT_DIM = HEIGHTFIELD_MAX_TILES_PER_AXIS + 1;
const VERT_COUNT = VERT_DIM * VERT_DIM;
const QUAD_COUNT = HEIGHTFIELD_MAX_TILES_PER_AXIS * HEIGHTFIELD_MAX_TILES_PER_AXIS;
const MAX_INDEX_COUNT = QUAD_COUNT * 6;

export const HEIGHTFIELD_DEEP_SEA_ELEVATION = -0.36;
export const HEIGHTFIELD_COASTAL_SEA_ELEVATION = -0.16;
export const HEIGHTFIELD_SAND_ELEVATION = 0.07;
export const HEIGHTFIELD_GRASS_ELEVATION = 0.18;
export const HEIGHTFIELD_MOUNTAIN_ELEVATION = 1.15;

export const heightfieldTileBaseElevation = (kind: HeightfieldTerrainKind): number => {
  switch (kind) {
    case "MOUNTAIN":
      return HEIGHTFIELD_MOUNTAIN_ELEVATION;
    case "GRASS":
      return HEIGHTFIELD_GRASS_ELEVATION;
    case "SAND":
      return HEIGHTFIELD_SAND_ELEVATION;
    case "COASTAL_SEA":
      return HEIGHTFIELD_COASTAL_SEA_ELEVATION;
    case "SEA":
      return HEIGHTFIELD_DEEP_SEA_ELEVATION;
  }
};

const MOUNTAIN_ROCK_LIGHT: [number, number, number] = [128, 120, 124];
const MOUNTAIN_ROCK_DARK: [number, number, number] = [98, 92, 96];
const GRASS_TINT_DEEP: [number, number, number] = legacy3DTerrainPalette.grassDark;
const GRASS_TINT_LIGHT: [number, number, number] = legacy3DTerrainPalette.grassLight;
// Distinct turquoise for the shoreline so it reads clearly through the
// transparent water plane and contrasts with the darker deep-sea floor.
const COASTAL_SEA_FLOOR: [number, number, number] = [122, 200, 214];
const DEEP_SEA_FLOOR: [number, number, number] = [42, 78, 110];

const heightfieldTileColor = (
  kind: HeightfieldTerrainKind,
  variant: 0 | 1 | 2
): [number, number, number] => {
  switch (kind) {
    case "MOUNTAIN":
      return variant === 0 ? MOUNTAIN_ROCK_DARK : MOUNTAIN_ROCK_LIGHT;
    case "GRASS":
      return variant === 0 ? GRASS_TINT_DEEP : variant === 1 ? GRASS_TINT_LIGHT : GRASS_TINT_DEEP;
    case "SAND":
      return legacy3DTerrainPalette.sand;
    case "COASTAL_SEA":
      return COASTAL_SEA_FLOOR;
    case "SEA":
      return DEEP_SEA_FLOOR;
  }
};

const wrap = (n: number, dim: number): number => {
  const m = n % dim;
  return m < 0 ? m + dim : m;
};

const elevationJitter = (wx: number, wy: number, kind: HeightfieldTerrainKind): number => {
  if (kind === "MOUNTAIN") {
    const h = ((wx * 73856093) ^ (wy * 19349663)) >>> 0;
    return ((h % 1024) / 1024 - 0.5) * 0.16;
  }
  if (kind === "GRASS" || kind === "SAND") {
    const h = ((wx * 374761393) ^ (wy * 668265263)) >>> 0;
    return ((h % 1024) / 1024 - 0.5) * 0.05;
  }
  return 0;
};

export type HeightfieldRebuildInputs = {
  readonly camX: number;
  readonly camY: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly tileKindAt: (wx: number, wy: number) => HeightfieldTerrainKind;
};

export type Heightfield = {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  readonly geometry: BufferGeometry;
  readonly gridlines: LineSegments;
  readonly rebuild: (inputs: HeightfieldRebuildInputs) => void;
  readonly elevationAt: (wx: number, wy: number) => number;
  readonly cornerYAt: (cornerX: number, cornerZ: number) => number;
  readonly setGridlinesVisible: (visible: boolean) => void;
  readonly dispose: () => void;
};

export const createHeightfield = (): Heightfield => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(VERT_COUNT * 3);
  const colors = new Float32Array(VERT_COUNT * 3);
  const indices = new Uint32Array(MAX_INDEX_COUNT);

  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);

  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: false,
    roughness: 0.92,
    metalness: 0.0,
    side: DoubleSide
  });

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;

  // Gridlines: a LineSegments that reuses the heightfield's position buffer,
  // with a precomputed index that draws only the horizontal and vertical
  // tile edges (no diagonals) so the grid follows the sculpted surface.
  const gridGeometry = new BufferGeometry();
  gridGeometry.setAttribute("position", geometry.getAttribute("position"));
  const HORIZONTAL_LINES = HEIGHTFIELD_MAX_TILES_PER_AXIS * VERT_DIM;
  const VERTICAL_LINES = HEIGHTFIELD_MAX_TILES_PER_AXIS * VERT_DIM;
  const GRID_INDEX_COUNT = (HORIZONTAL_LINES + VERTICAL_LINES) * 2;
  const gridIndices = new Uint32Array(GRID_INDEX_COUNT);
  gridGeometry.setIndex(new BufferAttribute(gridIndices, 1));
  gridGeometry.setDrawRange(0, 0);
  const gridMaterial = new LineBasicMaterial({
    color: "#0c1820",
    transparent: true,
    opacity: 0.42,
    depthWrite: false
  });
  const gridlines = new LineSegments(gridGeometry, gridMaterial);
  gridlines.frustumCulled = false;
  gridlines.renderOrder = 5;
  gridlines.visible = false;
  let gridLastTileSpanX = 0;
  let gridLastTileSpanY = 0;

  const elevationCache = new Map<number, number>();
  const elevationKey = (wx: number, wy: number): number => wx * 100003 + wy;

  let lastIndexCount = 0;
  let lastTileSpanX = 0;

  const rebuild = (inputs: HeightfieldRebuildInputs): void => {
    elevationCache.clear();
    const { camX, camY, halfW, halfH, worldWidth, worldHeight, tileKindAt } = inputs;

    const tileSpanX = Math.min(HEIGHTFIELD_MAX_TILES_PER_AXIS, Math.max(2, 2 * halfW + 3));
    const tileSpanY = Math.min(HEIGHTFIELD_MAX_TILES_PER_AXIS, Math.max(2, 2 * halfH + 3));
    const vertSpanX = tileSpanX + 1;
    const vertSpanY = tileSpanY + 1;
    const tileOffsetX = -Math.floor(tileSpanX / 2);
    const tileOffsetY = -Math.floor(tileSpanY / 2);

    type TileSample = {
      readonly elevation: number;
      readonly r: number;
      readonly g: number;
      readonly b: number;
    };
    const tileSampleCache = new Map<number, TileSample>();

    const sampleTile = (di: number, dj: number): TileSample => {
      const wx = wrap(camX + tileOffsetX + di, worldWidth);
      const wy = wrap(camY + tileOffsetY + dj, worldHeight);
      const cacheKey = wx * 100003 + wy;
      const cached = tileSampleCache.get(cacheKey);
      if (cached) return cached;
      const kind = tileKindAt(wx, wy);
      const variant = terrainShadeVariantAt(wx, wy);
      const [cr, cg, cb] = heightfieldTileColor(kind, variant);
      const elevation = heightfieldTileBaseElevation(kind) + elevationJitter(wx, wy, kind);
      const sample: TileSample = { elevation, r: cr / 255, g: cg / 255, b: cb / 255 };
      tileSampleCache.set(cacheKey, sample);
      elevationCache.set(elevationKey(wx, wy), heightfieldTileBaseElevation(kind));
      return sample;
    };

    for (let j = 0; j < vertSpanY; j += 1) {
      for (let i = 0; i < vertSpanX; i += 1) {
        const s00 = sampleTile(i - 1, j - 1);
        const s10 = sampleTile(i, j - 1);
        const s01 = sampleTile(i - 1, j);
        const s11 = sampleTile(i, j);
        const elevation = (s00.elevation + s10.elevation + s01.elevation + s11.elevation) * 0.25;
        const r = (s00.r + s10.r + s01.r + s11.r) * 0.25;
        const g = (s00.g + s10.g + s01.g + s11.g) * 0.25;
        const b = (s00.b + s10.b + s01.b + s11.b) * 0.25;
        const baseIdx = (j * VERT_DIM + i) * 3;
        positions[baseIdx + 0] = tileOffsetX + i;
        positions[baseIdx + 1] = elevation;
        positions[baseIdx + 2] = tileOffsetY + j;
        colors[baseIdx + 0] = r;
        colors[baseIdx + 1] = g;
        colors[baseIdx + 2] = b;
      }
    }

    if (tileSpanX !== lastTileSpanX) {
      let idxCount = 0;
      for (let j = 0; j < tileSpanY; j += 1) {
        for (let i = 0; i < tileSpanX; i += 1) {
          const a = j * VERT_DIM + i;
          const b = a + 1;
          const c = a + VERT_DIM;
          const d = c + 1;
          indices[idxCount++] = a;
          indices[idxCount++] = c;
          indices[idxCount++] = b;
          indices[idxCount++] = b;
          indices[idxCount++] = c;
          indices[idxCount++] = d;
        }
      }
      lastIndexCount = idxCount;
      lastTileSpanX = tileSpanX;
      const indexAttr = geometry.index;
      if (indexAttr) indexAttr.needsUpdate = true;
    } else if (tileSpanY * tileSpanX * 6 !== lastIndexCount) {
      let idxCount = 0;
      for (let j = 0; j < tileSpanY; j += 1) {
        for (let i = 0; i < tileSpanX; i += 1) {
          const a = j * VERT_DIM + i;
          const b = a + 1;
          const c = a + VERT_DIM;
          const d = c + 1;
          indices[idxCount++] = a;
          indices[idxCount++] = c;
          indices[idxCount++] = b;
          indices[idxCount++] = b;
          indices[idxCount++] = c;
          indices[idxCount++] = d;
        }
      }
      lastIndexCount = idxCount;
      const indexAttr = geometry.index;
      if (indexAttr) indexAttr.needsUpdate = true;
    }

    const positionAttr = geometry.attributes.position;
    const colorAttr = geometry.attributes.color;
    if (positionAttr) positionAttr.needsUpdate = true;
    if (colorAttr) colorAttr.needsUpdate = true;
    geometry.setDrawRange(0, lastIndexCount);
    geometry.computeVertexNormals();

    if (gridlines.visible && (tileSpanX !== gridLastTileSpanX || tileSpanY !== gridLastTileSpanY)) {
      let gridIdx = 0;
      // Horizontal edges: for every vertex row, connect (i,j)-(i+1,j)
      for (let j = 0; j <= tileSpanY; j += 1) {
        for (let i = 0; i < tileSpanX; i += 1) {
          gridIndices[gridIdx++] = j * VERT_DIM + i;
          gridIndices[gridIdx++] = j * VERT_DIM + i + 1;
        }
      }
      // Vertical edges: for every vertex column, connect (i,j)-(i,j+1)
      for (let j = 0; j < tileSpanY; j += 1) {
        for (let i = 0; i <= tileSpanX; i += 1) {
          gridIndices[gridIdx++] = j * VERT_DIM + i;
          gridIndices[gridIdx++] = (j + 1) * VERT_DIM + i;
        }
      }
      gridGeometry.setDrawRange(0, gridIdx);
      const gridIndexAttr = gridGeometry.index;
      if (gridIndexAttr) gridIndexAttr.needsUpdate = true;
      gridLastTileSpanX = tileSpanX;
      gridLastTileSpanY = tileSpanY;
    }
    if (gridlines.visible) {
      const gridPosAttr = gridGeometry.getAttribute("position");
      if (gridPosAttr) (gridPosAttr as BufferAttribute).needsUpdate = true;
    }
  };

  const elevationAt = (wx: number, wy: number): number => {
    const cached = elevationCache.get(elevationKey(wx, wy));
    return cached ?? 0;
  };

  // Heightfield corner Y for the integer grid corner at (cornerX, cornerZ),
  // which is shared by tiles (cornerX-1, cornerZ-1), (cornerX, cornerZ-1),
  // (cornerX-1, cornerZ), (cornerX, cornerZ). Mirrors the corner-averaging in
  // rebuild() so an ownership overlay placed at the four corners of a tile
  // traces the same surface the heightfield renders.
  const cornerYAt = (cornerX: number, cornerZ: number): number => {
    const a = elevationAt(cornerX - 1, cornerZ - 1);
    const b = elevationAt(cornerX, cornerZ - 1);
    const c = elevationAt(cornerX - 1, cornerZ);
    const d = elevationAt(cornerX, cornerZ);
    return (a + b + c + d) * 0.25;
  };

  const setGridlinesVisible = (visible: boolean): void => {
    gridlines.visible = visible;
    if (visible) {
      // Force the index rebuild on next rebuild() call.
      gridLastTileSpanX = 0;
      gridLastTileSpanY = 0;
    }
  };

  const dispose = (): void => {
    geometry.dispose();
    material.dispose();
    gridGeometry.dispose();
    gridMaterial.dispose();
  };

  return { mesh, material, geometry, gridlines, rebuild, elevationAt, cornerYAt, setGridlinesVisible, dispose };
};

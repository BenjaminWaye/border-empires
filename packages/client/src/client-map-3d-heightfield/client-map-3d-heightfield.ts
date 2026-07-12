import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Vector2
} from "three";
import {
  createTerrainDetailMaps,
  legacy3DTerrainPalette,
  type TerrainDetailMaps
} from "../client-map-3d-terrain-textures/client-map-3d-terrain-textures.js";
import { terrainShadeVariantAt } from "../client-map-3d-terrain-variation/client-map-3d-terrain-variation.js";
import { accumulateHeightfieldNormals } from "../client-map-3d-heightfield-normals.js";

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

// The heightfield surface has zero thickness, and sea tiles are skipped
// entirely so the water plane can sit on top of the hole. At grazing camera
// angles that leaves a vertical riser between the coast bevel (coastEdgeY,
// below) and the water/void with no geometry covering it, which reads as a
// black crack at the shoreline. SKIRT_BOTTOM_Y is a "wall" every coastal
// land edge drops to, well below the lowest water displacement, so that
// riser is always covered by solid (if unlit) geometry instead of empty
// canvas.
const SKIRT_BOTTOM_Y = -0.6;
const SKIRT_SHADE = 0.55;

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
const COASTAL_SEA_FLOOR: [number, number, number] = [188, 162, 112];
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
  readonly isExploredAt?: (wx: number, wy: number) => boolean;
  // Drives the "darker grass around trees" zone — any tile within
  // FOREST_HALO_RADIUS of a forest tile gets a forestProximity = 1, smoothed
  // at corners through vertex averaging. Optional so tests don't have to
  // pass it; absent → no halo.
  readonly isForestAt?: (wx: number, wy: number) => boolean;
};

const FOREST_HALO_RADIUS = 2;

export type Heightfield = {
  readonly mesh: Mesh;
  readonly material: MeshStandardMaterial;
  readonly geometry: BufferGeometry;
  readonly gridlines: LineSegments;
  readonly skirtMesh: Mesh;
  readonly detailMaps: TerrainDetailMaps;
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
  // UV uses world tile coords so the painterly biome textures stay glued to
  // tiles as the camera pans. The grass texture's `repeat` is set so one
  // full painted pattern spans `tilesPerRepeat` tiles, killing the obvious
  // 1-tile barcode look that the previous packed grayscale produced.
  const uvs = new Float32Array(VERT_COUNT * 2);
  // Per-vertex forest-halo strength. Averaged at corners across the 4
  // surrounding tiles, so the boundary of the dark-grass zone fades over
  // ~1 tile through standard vertex interpolation in the rasterizer.
  const forestZones = new Float32Array(VERT_COUNT);
  // Owned normal buffer so we can write face-accumulated normals directly
  // and skip three.js's computeVertexNormals BufferAttribute round-trip
  // (the per-frame hot spot in panning profiles).
  const normals = new Float32Array(VERT_COUNT * 3);
  const indices = new Uint32Array(MAX_INDEX_COUNT);

  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute("forestZone", new BufferAttribute(forestZones, 1));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);

  // Painterly biome detail suite: a full-color grass texture, a full-color
  // sand texture, and a shared normal+roughness pair. The fragment shader
  // (onBeforeCompile below) samples both color textures at the same UV and
  // blends them by the vertex-color biome mask, so each biome looks like
  // hand-painted grass or hand-painted sand rather than the same noise.
  const detailMaps = createTerrainDetailMaps();

  // Use the grass color map as the primary `map` so three.js sets up the
  // USE_MAP define + vMapUv varying for us. The sand map is wired in as a
  // custom uniform and sampled at the same vMapUv (both textures use the
  // same `repeat` so the UV transform matches).
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: false,
    map: detailMaps.grassColorMap ?? null,
    normalMap: detailMaps.normalMap ?? null,
    normalScale: new Vector2(1.05, 1.05),
    roughnessMap: detailMaps.roughnessMap ?? null,
    roughness: 0.92,
    metalness: 0.0,
    side: DoubleSide
  });

  // Replace three.js's built-in <map_fragment> with a biome-aware two-texture
  // blend that also adds per-tile variation. The painted grass/sand textures
  // tile every 8 world units, but each individual world tile hashes its
  // coord into a 90° rotation + random offset so it samples a different
  // region of the texture — the eye stops noticing repetition. Soft-narrow
  // biome cut keeps the grass/sand boundary anti-aliased without the
  // mid-blend zone that read as a darker green band before.
  if (detailMaps.sandColorMap) {
    const sandMapUniform = { value: detailMaps.sandColorMap };
    material.onBeforeCompile = (shader): void => {
      shader.uniforms.sandColorMap = sandMapUniform;

      // Vertex shader: pass the raw world-coord uv (= camX + tileOffsetX + i,
      // see rebuild()) through as `vTerrainWorldUv` so the fragment shader
      // can recover which world tile a pixel belongs to via floor(). Also
      // pass the forestZone attribute (corner-averaged forest proximity)
      // for the dark-grass halo around tree tiles.
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
attribute float forestZone;
varying vec2 vTerrainWorldUv;
varying float vForestZone;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
vTerrainWorldUv = uv;
vForestZone = forestZone;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
uniform sampler2D sandColorMap;
varying vec2 vTerrainWorldUv;
varying float vForestZone;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
      #ifdef USE_MAP
        // ---- Per-tile UV variation ----
        // Hash the world-tile coord for a 90° rotation index + a random
        // (offsetX, offsetY) within [0, 8) world-units. Adjacent tiles get
        // independent hashes so they sample disjoint regions of the same
        // painted texture and rotate independently — repetition vanishes.
        vec2 tileId = floor(vTerrainWorldUv);
        float h1 = fract(sin(dot(tileId, vec2(12.9898, 78.233))) * 43758.5453);
        float h2 = fract(sin(dot(tileId, vec2(63.7264, 10.873))) * 43758.5453);
        float angle = floor(h1 * 4.0) * 1.5707963267948966;
        float ca = cos(angle);
        float sa = sin(angle);
        mat2 R = mat2(ca, -sa, sa, ca);
        vec2 inTile = vTerrainWorldUv - tileId;
        vec2 rotated = R * (inTile - 0.5) + 0.5;
        vec2 offset = vec2(h2 * 8.0, fract(h2 * 7.31) * 8.0);
        // Multiply by 1/tilesPerRepeat (8) to put back into texture-local UV;
        // the texture has RepeatWrapping so any value samples cleanly.
        vec2 sampleUv = (tileId + rotated + offset) * 0.125;

        vec4 grassSample = texture2D( map, sampleUv );
        vec4 sandSample = texture2D( sandColorMap, sampleUv );
        float greenBias = vColor.g - 0.5 * (vColor.r + vColor.b);
        // Soft-narrow biome cut: 0.03-wide blend zone, just enough to
        // antialias the seam without a visible mid-blend band of
        // muddy-green-into-tan.
        float grassMask = smoothstep(0.055, 0.085, greenBias);
        vec3 biomeColor = mix(sandSample.rgb, grassSample.rgb, grassMask);

        // Forest halo: where the grass is within 2 tiles of a tree tile
        // (vForestZone interpolates 0..1 from the per-corner average),
        // multiply down toward a forest-floor tone. Gated by grassMask so
        // sand near forests stays bright. Only ~30% darkening at full
        // strength so the speckled grass detail is still readable.
        float forestDarken = vForestZone * grassMask;
        vec3 forestTinted = biomeColor * mix(vec3(1.0), vec3(0.66, 0.78, 0.58), forestDarken);

        // Very mild vertex-color tint at 12% — beach-corner blends and
        // per-tile shade variants still register; painted base dominates.
        float vertLum = max(0.001, dot(vColor.rgb, vec3(0.299, 0.587, 0.114)));
        vec3 tint = mix(vec3(1.0), vColor.rgb / vertLum, 0.12);
        diffuseColor.rgb = forestTinted * tint;
      #endif
      `
      );

      // Brightness floor: lifts pure-black cliff walls (near-vertical faces
      // that receive almost no overhead directional light) to a dark sandy
      // tone. max() leaves well-lit grass/sand faces completely unchanged.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <output_fragment>",
        `#include <output_fragment>
gl_FragColor.rgb = max(gl_FragColor.rgb, vec3(0.10, 0.07, 0.03));`
      );
    };
  }

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;

  // Skirt: a vertical wall dropped from every coastal land edge (where a
  // drawn land tile borders a skipped sea/unexplored tile) down to
  // SKIRT_BOTTOM_Y. Plain vertex-colored material — no biome textures — it
  // is only ever glimpsed edge-on as a thin sliver beneath the coast bevel.
  // Sized for the worst case (every tile edge is a coastline) so the typed
  // arrays never need to grow at runtime.
  const MAX_SKIRT_EDGES = QUAD_COUNT * 4;
  const skirtPositions = new Float32Array(MAX_SKIRT_EDGES * 4 * 3);
  const skirtColors = new Float32Array(MAX_SKIRT_EDGES * 4 * 3);
  // Written directly per edge (flat quad normal) rather than via
  // geometry.computeVertexNormals() — that method loops over the buffer's
  // full preallocated index/position count, not the draw range, so on a
  // MAX_SKIRT_EDGES-sized buffer it would rescan up to ~1M entries every
  // rebuild() regardless of how few skirt edges are actually active.
  const skirtNormals = new Float32Array(MAX_SKIRT_EDGES * 4 * 3);
  const skirtIndices = new Uint32Array(MAX_SKIRT_EDGES * 6);
  const skirtGeometry = new BufferGeometry();
  skirtGeometry.setAttribute("position", new BufferAttribute(skirtPositions, 3));
  skirtGeometry.setAttribute("color", new BufferAttribute(skirtColors, 3));
  skirtGeometry.setAttribute("normal", new BufferAttribute(skirtNormals, 3));
  skirtGeometry.setIndex(new BufferAttribute(skirtIndices, 1));
  skirtGeometry.setDrawRange(0, 0);
  const skirtMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: DoubleSide
  });
  const skirtMesh = new Mesh(skirtGeometry, skirtMaterial);
  skirtMesh.frustumCulled = false;
  skirtMesh.receiveShadow = false;
  skirtMesh.castShadow = false;

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
  // Rendered corner-Y cache populated during rebuild(). Keyed on the
  // integer world coords of the corner (cornerX, cornerZ). Stores the
  // exact Y written into the heightfield position buffer for that
  // corner — including the coastEdgeY pull-down at mixed corners and
  // the explored-only filter — so overlays anchored to the heightfield
  // surface (ownership rings, hover/select markers) match what the
  // user actually sees rather than the averaged base elevations.
  const renderedCornerYCache = new Map<number, number>();

  let lastIndexCount = 0;
  let lastTileSpanX = 0;

  const rebuild = (inputs: HeightfieldRebuildInputs): void => {
    elevationCache.clear();
    renderedCornerYCache.clear();
    const {
      camX,
      camY,
      halfW,
      halfH,
      worldWidth,
      worldHeight,
      tileKindAt,
      isExploredAt,
      isForestAt
    } = inputs;
    const exploredAt = isExploredAt ?? ((): boolean => true);
    const forestAt = isForestAt ?? ((): boolean => false);

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
      readonly isSea: boolean;
      readonly isExplored: boolean;
      readonly forestProx: number;
    };
    const tileSampleCache = new Map<number, TileSample>();

    // 1 if this tile or any tile within FOREST_HALO_RADIUS is a forest, else 0.
    // Cheap toroidal Chebyshev-disc scan; the early-exit on the first hit
    // keeps cost low even at the radius=2 (5×5 = 25 lookups worst case).
    const forestProxAt = (wx: number, wy: number): number => {
      for (let dy = -FOREST_HALO_RADIUS; dy <= FOREST_HALO_RADIUS; dy += 1) {
        for (let dx = -FOREST_HALO_RADIUS; dx <= FOREST_HALO_RADIUS; dx += 1) {
          if (forestAt(wrap(wx + dx, worldWidth), wrap(wy + dy, worldHeight))) return 1;
        }
      }
      return 0;
    };

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
      const isSea = kind === "SEA" || kind === "COASTAL_SEA";
      const isExplored = exploredAt(wx, wy);
      // Forest halo only matters on land grass — no point scanning sea/mountain.
      const forestProx = !isSea && kind !== "MOUNTAIN" ? forestProxAt(wx, wy) : 0;
      const sample: TileSample = {
        elevation,
        r: cr / 255,
        g: cg / 255,
        b: cb / 255,
        isSea,
        isExplored,
        forestProx
      };
      tileSampleCache.set(cacheKey, sample);
      elevationCache.set(elevationKey(wx, wy), heightfieldTileBaseElevation(kind));
      return sample;
    };

    // Vertex categories so the heightfield reads as discrete tile cells:
    //  - all sea: no triangle drawn (per-tile water quad covers it).
    //  - all land: average only land neighbours so the tile is flat at land Y.
    //  - mixed (coast): pull the corner Y down to just above water and tint
    //    the vertex sandy-white so the LAND tile bevels into the water as
    //    a soft beach instead of dropping off as a black cliff.
    const seaFloorFallbackY = heightfieldTileBaseElevation("SEA");
    const coastEdgeY = -0.04;
    const beachR = 244 / 255;
    const beachG = 232 / 255;
    const beachB = 198 / 255;

    for (let j = 0; j < vertSpanY; j += 1) {
      for (let i = 0; i < vertSpanX; i += 1) {
        const s00 = sampleTile(i - 1, j - 1);
        const s10 = sampleTile(i, j - 1);
        const s01 = sampleTile(i - 1, j);
        const s11 = sampleTile(i, j);
        // Count categories inline — the previous Array.filter chain ran
        // three filters per vertex (3× allocations + 3× closures × VERT_COUNT)
        // and dominated GC during pan. Same averaging semantics, no allocs.
        const s00Land = s00.isExplored && !s00.isSea;
        const s10Land = s10.isExplored && !s10.isSea;
        const s01Land = s01.isExplored && !s01.isSea;
        const s11Land = s11.isExplored && !s11.isSea;
        const s00Sea = s00.isExplored && s00.isSea;
        const s10Sea = s10.isExplored && s10.isSea;
        const s01Sea = s01.isExplored && s01.isSea;
        const s11Sea = s11.isExplored && s11.isSea;
        const landCount =
          (s00Land ? 1 : 0) + (s10Land ? 1 : 0) + (s01Land ? 1 : 0) + (s11Land ? 1 : 0);
        const seaCount =
          (s00Sea ? 1 : 0) + (s10Sea ? 1 : 0) + (s01Sea ? 1 : 0) + (s11Sea ? 1 : 0);
        const exploredCount = landCount + seaCount;
        let elevation: number;
        let r: number;
        let g: number;
        let b: number;
        if (exploredCount === 0 || landCount === 0) {
          // No explored land touches this corner; vertex won't be drawn
          // (all surrounding tiles are skipped in the index buffer), so
          // values here are placeholders.
          elevation = seaFloorFallbackY;
          r = (s00.r + s10.r + s01.r + s11.r) * 0.25;
          g = (s00.g + s10.g + s01.g + s11.g) * 0.25;
          b = (s00.b + s10.b + s01.b + s11.b) * 0.25;
        } else if (seaCount === 0) {
          // All explored neighbours are land — flat land top, no beach.
          let sumE = 0;
          let sumR = 0;
          let sumG = 0;
          let sumB = 0;
          if (s00Land) { sumE += s00.elevation; sumR += s00.r; sumG += s00.g; sumB += s00.b; }
          if (s10Land) { sumE += s10.elevation; sumR += s10.r; sumG += s10.g; sumB += s10.b; }
          if (s01Land) { sumE += s01.elevation; sumR += s01.r; sumG += s01.g; sumB += s01.b; }
          if (s11Land) { sumE += s11.elevation; sumR += s11.r; sumG += s11.g; sumB += s11.b; }
          const inv = 1 / landCount;
          elevation = sumE * inv;
          r = sumR * inv;
          g = sumG * inv;
          b = sumB * inv;
        } else {
          // Coast corner: more (explored) sea around the corner ⇒ closer
          // to water and whiter (foam). Only explored sea contributes —
          // unexplored neighbours don't pull the edge into beach.
          const beachMix = seaCount / exploredCount;
          let landSumR = 0;
          let landSumG = 0;
          let landSumB = 0;
          if (s00Land) { landSumR += s00.r; landSumG += s00.g; landSumB += s00.b; }
          if (s10Land) { landSumR += s10.r; landSumG += s10.g; landSumB += s10.b; }
          if (s01Land) { landSumR += s01.r; landSumG += s01.g; landSumB += s01.b; }
          if (s11Land) { landSumR += s11.r; landSumG += s11.g; landSumB += s11.b; }
          const invLand = 1 / landCount;
          const landR = landSumR * invLand;
          const landG = landSumG * invLand;
          const landB = landSumB * invLand;
          elevation = coastEdgeY;
          r = landR * (1 - beachMix) + beachR * beachMix;
          g = landG * (1 - beachMix) + beachG * beachMix;
          b = landB * (1 - beachMix) + beachB * beachMix;
        }
        const baseIdx = (j * VERT_DIM + i) * 3;
        positions[baseIdx + 0] = tileOffsetX + i;
        positions[baseIdx + 1] = elevation;
        positions[baseIdx + 2] = tileOffsetY + j;
        colors[baseIdx + 0] = r;
        colors[baseIdx + 1] = g;
        colors[baseIdx + 2] = b;
        // World-anchored UV: as the camera pans, the texture slides under
        // tile boundaries to match the world content shifting through the
        // mesh slot. Combined with the texture's repeat = 1/tilesPerRepeat,
        // each painted region spans many tiles so the per-tile barcode look
        // disappears and adjacent tiles draw different parts of the painting.
        const baseUv = (j * VERT_DIM + i) * 2;
        uvs[baseUv + 0] = camX + tileOffsetX + i;
        uvs[baseUv + 1] = camY + tileOffsetY + j;
        // Forest halo: average the 4 surrounding tiles' forestProx so the
        // halo edge fades over a tile through standard vertex interpolation.
        const vertIdx = j * VERT_DIM + i;
        forestZones[vertIdx] = (s00.forestProx + s10.forestProx + s01.forestProx + s11.forestProx) * 0.25;
        // Cache the rendered corner-Y keyed by world coords so overlay
        // helpers can look up the exact surface Y the heightfield drew.
        const cornerWorldX = wrap(camX + tileOffsetX + i, worldWidth);
        const cornerWorldZ = wrap(camY + tileOffsetY + j, worldHeight);
        renderedCornerYCache.set(elevationKey(cornerWorldX, cornerWorldZ), elevation);
      }
    }

    // Index buffer rebuilt every call now: the sea/land mask shifts as
    // the camera pans, and sea tiles are skipped entirely so the
    // heightfield has tile-shaped holes where the per-tile water quads
    // sit on top.
    {
      let idxCount = 0;
      for (let j = 0; j < tileSpanY; j += 1) {
        for (let i = 0; i < tileSpanX; i += 1) {
          const sample = sampleTile(i, j);
          if (sample.isSea || !sample.isExplored) continue;
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
    }

    // Skirt pass: for every drawn (land) tile, drop a vertical wall along
    // any edge shared with a skipped (sea/unexplored) neighbour tile so
    // there is solid geometry under the coast bevel at grazing angles.
    {
      let skirtVertCount = 0;
      let skirtIdxCount = 0;
      // sampleTile wraps its (di, dj) offsets toroidally, so this reads the
      // real neighbour even just past the current rebuild window — the
      // window edge itself is not a coastline and must not grow a skirt.
      const isHole = (i: number, j: number): boolean => {
        const s = sampleTile(i, j);
        return s.isSea || !s.isExplored;
      };
      const emitSkirtEdge = (
        ax: number, az: number, ay: number, ar: number, ag: number, ab: number,
        bx: number, bz: number, by: number, br: number, bg: number, bb: number
      ): void => {
        if (skirtVertCount + 4 > MAX_SKIRT_EDGES * 4) return;
        const base = skirtVertCount;
        const p = base * 3;
        skirtPositions[p + 0] = ax; skirtPositions[p + 1] = ay; skirtPositions[p + 2] = az;
        skirtPositions[p + 3] = bx; skirtPositions[p + 4] = by; skirtPositions[p + 5] = bz;
        skirtPositions[p + 6] = ax; skirtPositions[p + 7] = SKIRT_BOTTOM_Y; skirtPositions[p + 8] = az;
        skirtPositions[p + 9] = bx; skirtPositions[p + 10] = SKIRT_BOTTOM_Y; skirtPositions[p + 11] = bz;
        const c = base * 3;
        skirtColors[c + 0] = ar; skirtColors[c + 1] = ag; skirtColors[c + 2] = ab;
        skirtColors[c + 3] = br; skirtColors[c + 4] = bg; skirtColors[c + 5] = bb;
        skirtColors[c + 6] = ar * SKIRT_SHADE; skirtColors[c + 7] = ag * SKIRT_SHADE; skirtColors[c + 8] = ab * SKIRT_SHADE;
        skirtColors[c + 9] = br * SKIRT_SHADE; skirtColors[c + 10] = bg * SKIRT_SHADE; skirtColors[c + 11] = bb * SKIRT_SHADE;
        // Flat quad normal: perpendicular to the top edge in the XZ plane.
        // The skirt is a vertical wall, so this is a fair approximation even
        // without accounting for the (usually tiny) top-edge Y slope — good
        // enough for a face that's only ever seen edge-on as a thin sliver.
        const dx = bx - ax;
        const dz = bz - az;
        const len = Math.hypot(dx, dz) || 1;
        const nx = dz / len;
        const nz = -dx / len;
        skirtNormals[p + 0] = nx; skirtNormals[p + 1] = 0; skirtNormals[p + 2] = nz;
        skirtNormals[p + 3] = nx; skirtNormals[p + 4] = 0; skirtNormals[p + 5] = nz;
        skirtNormals[p + 6] = nx; skirtNormals[p + 7] = 0; skirtNormals[p + 8] = nz;
        skirtNormals[p + 9] = nx; skirtNormals[p + 10] = 0; skirtNormals[p + 11] = nz;
        skirtIndices[skirtIdxCount++] = base + 0;
        skirtIndices[skirtIdxCount++] = base + 2;
        skirtIndices[skirtIdxCount++] = base + 1;
        skirtIndices[skirtIdxCount++] = base + 1;
        skirtIndices[skirtIdxCount++] = base + 2;
        skirtIndices[skirtIdxCount++] = base + 3;
        skirtVertCount += 4;
      };
      const cornerAt = (i: number, j: number): { x: number; y: number; z: number; r: number; g: number; b: number } => {
        const idx = j * VERT_DIM + i;
        return {
          x: positions[idx * 3 + 0] as number,
          y: positions[idx * 3 + 1] as number,
          z: positions[idx * 3 + 2] as number,
          r: colors[idx * 3 + 0] as number,
          g: colors[idx * 3 + 1] as number,
          b: colors[idx * 3 + 2] as number
        };
      };
      for (let j = 0; j < tileSpanY; j += 1) {
        for (let i = 0; i < tileSpanX; i += 1) {
          const sample = sampleTile(i, j);
          if (sample.isSea || !sample.isExplored) continue;
          // Corner grid indices for this tile: a=TL, b=TR, c=BL, d=BR.
          const a = cornerAt(i, j);
          const b = cornerAt(i + 1, j);
          const c = cornerAt(i, j + 1);
          const d = cornerAt(i + 1, j + 1);
          if (isHole(i, j - 1)) emitSkirtEdge(a.x, a.z, a.y, a.r, a.g, a.b, b.x, b.z, b.y, b.r, b.g, b.b);
          if (isHole(i, j + 1)) emitSkirtEdge(c.x, c.z, c.y, c.r, c.g, c.b, d.x, d.z, d.y, d.r, d.g, d.b);
          if (isHole(i - 1, j)) emitSkirtEdge(c.x, c.z, c.y, c.r, c.g, c.b, a.x, a.z, a.y, a.r, a.g, a.b);
          if (isHole(i + 1, j)) emitSkirtEdge(b.x, b.z, b.y, b.r, b.g, b.b, d.x, d.z, d.y, d.r, d.g, d.b);
        }
      }
      const skirtPosAttr = skirtGeometry.getAttribute("position");
      const skirtColorAttr = skirtGeometry.getAttribute("color");
      const skirtNormalAttr = skirtGeometry.getAttribute("normal");
      const skirtIndexAttr = skirtGeometry.index;
      if (skirtPosAttr) (skirtPosAttr as BufferAttribute).needsUpdate = true;
      if (skirtColorAttr) (skirtColorAttr as BufferAttribute).needsUpdate = true;
      if (skirtNormalAttr) (skirtNormalAttr as BufferAttribute).needsUpdate = true;
      if (skirtIndexAttr) skirtIndexAttr.needsUpdate = true;
      skirtGeometry.setDrawRange(0, skirtIdxCount);
    }

    const positionAttr = geometry.attributes.position;
    const colorAttr = geometry.attributes.color;
    const uvAttr = geometry.attributes.uv;
    const forestAttr = geometry.attributes.forestZone;
    const normalAttr = geometry.attributes.normal;
    if (positionAttr) positionAttr.needsUpdate = true;
    if (colorAttr) colorAttr.needsUpdate = true;
    if (uvAttr) uvAttr.needsUpdate = true;
    if (forestAttr) forestAttr.needsUpdate = true;
    geometry.setDrawRange(0, lastIndexCount);
    accumulateHeightfieldNormals(positions, indices, lastIndexCount, normals, VERT_COUNT);
    if (normalAttr) normalAttr.needsUpdate = true;

    if (gridlines.visible) {
      // Gridlines must mirror the heightfield's tile-skip rule — emit
      // an edge only if at least one adjacent tile is drawn (explored
      // and not sea). Otherwise unexplored corners (parked at sea-floor
      // Y) form a visible carpet of grid squares beneath the void.
      const tileDrawn = (i: number, j: number): boolean => {
        if (i < 0 || j < 0 || i >= tileSpanX || j >= tileSpanY) return false;
        const s = sampleTile(i, j);
        return s.isExplored && !s.isSea;
      };
      let gridIdx = 0;
      // Horizontal edges along row j: bordered by tiles (i, j-1) above and (i, j) below.
      for (let j = 0; j <= tileSpanY; j += 1) {
        for (let i = 0; i < tileSpanX; i += 1) {
          if (!tileDrawn(i, j - 1) && !tileDrawn(i, j)) continue;
          gridIndices[gridIdx++] = j * VERT_DIM + i;
          gridIndices[gridIdx++] = j * VERT_DIM + i + 1;
        }
      }
      // Vertical edges along column i: bordered by tiles (i-1, j) left and (i, j) right.
      for (let j = 0; j < tileSpanY; j += 1) {
        for (let i = 0; i <= tileSpanX; i += 1) {
          if (!tileDrawn(i - 1, j) && !tileDrawn(i, j)) continue;
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
  // (cornerX-1, cornerZ), (cornerX, cornerZ). Returns the *rendered* Y
  // from the last rebuild — the same value written into the heightfield
  // position buffer (including coastEdgeY pull-down at mixed corners and
  // the explored-only filter), so overlays anchored at this corner sit
  // exactly on the visible surface. Falls back to averaged base
  // elevations for corners outside the visible window (rare; e.g. the
  // dock orientation lookup near the edge of the rebuild span).
  const cornerYAt = (cornerX: number, cornerZ: number): number => {
    const cached = renderedCornerYCache.get(elevationKey(cornerX, cornerZ));
    if (cached !== undefined) return cached;
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
    detailMaps.dispose();
    gridGeometry.dispose();
    gridMaterial.dispose();
    skirtGeometry.dispose();
    skirtMaterial.dispose();
  };

  return {
    mesh,
    material,
    geometry,
    gridlines,
    skirtMesh,
    detailMaps,
    rebuild,
    elevationAt,
    cornerYAt,
    setGridlinesVisible,
    dispose
  };
};

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
  type TerrainDetailMaps
} from "../client-map-3d-terrain-textures/client-map-3d-terrain-textures.js";
import { terrainShadeVariantAt } from "../client-map-3d-terrain-variation/client-map-3d-terrain-variation.js";
import { accumulateHeightfieldNormals } from "../client-map-3d-heightfield-normals.js";
import {
  coastCornerElevation, elevationJitter,
  heightfieldTileBaseElevation,
  heightfieldTileColor,
  wrap,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  type HeightfieldTerrainKind
} from "../client-map-3d-heightfield-terrain.js";
// Re-exported so existing consumers (client-map-3d-hills.ts, storybook,
// this module's own test) keep importing terrain data from here.
export * from "../client-map-3d-heightfield-terrain.js";

// A vertex shared by N tiles takes the mean of their elevations/colors, so
// two mountain tiles raise their shared edge to a ridge while a lone
// mountain swells to only ~25% height (completed by its massif peak).
export const HEIGHTFIELD_MAX_TILES_PER_AXIS = 240;
const VERT_DIM = HEIGHTFIELD_MAX_TILES_PER_AXIS + 1;
const VERT_COUNT = VERT_DIM * VERT_DIM;
const QUAD_COUNT = HEIGHTFIELD_MAX_TILES_PER_AXIS * HEIGHTFIELD_MAX_TILES_PER_AXIS;
const MAX_INDEX_COUNT = QUAD_COUNT * 6;

// The heightfield surface has zero thickness, and sea tiles are skipped
// entirely so the water plane can sit on top of the hole. At grazing camera
// angles that leaves a vertical riser between the coast bevel (coastEdgeY,
// below) and the water/void with no geometry covering it, which reads as a
// black crack at the shoreline. SKIRT_BOTTOM_Y is a "wall" every coastal
// land edge drops to, well below the lowest water displacement, so that
// riser is always covered by solid (if unlit) geometry instead of empty
// canvas.
// Exported so client-map-3d-hills.ts's own skirt (hill dome edges bordering
// a hole have exactly the same zero-thickness problem, and previously had
// no skirt at all) drops to the identical depth and shade — two different
// skirts meeting at a shared tile boundary need to agree, or the seam
// between them becomes its own crack.
export const SKIRT_BOTTOM_Y = -0.6;
// 0.55 read near-black under the water's dark tint at a wave trough (#1482).
export const SKIRT_SHADE = 0.72;

export type HeightfieldRebuildInputs = {
  readonly camX: number;
  readonly camY: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly tileKindAt: (wx: number, wy: number) => HeightfieldTerrainKind;
  readonly isExploredAt?: (wx: number, wy: number) => boolean;
  // Drives the "darker grass" halo near trees (forestProximity, smoothed
  // via vertex averaging). Absent → no halo.
  readonly isForestAt?: (wx: number, wy: number) => boolean;
  // Excludes GRASS/SAND/TUNDRA hills tiles (rendered by client-map-3d-hills.ts).
  readonly isHillsAt?: (wx: number, wy: number) => boolean;
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
  // Per-vertex TUNDRA fraction (0..1), corner-averaged the same way as
  // forestZone. Unlike the grass/sand split, TUNDRA can't be told apart
  // from SAND by inferring it from the blended vertex color alone (its
  // pale palette lands too close to sand's in greenBias space) — this
  // explicit mask is sampled directly in the shader instead.
  const tundraZones = new Float32Array(VERT_COUNT);
  // Owned normal buffer so we can write face-accumulated normals directly
  // and skip three.js's computeVertexNormals BufferAttribute round-trip
  // (the per-frame hot spot in panning profiles).
  const normals = new Float32Array(VERT_COUNT * 3);
  const indices = new Uint32Array(MAX_INDEX_COUNT);

  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute("forestZone", new BufferAttribute(forestZones, 1));
  geometry.setAttribute("tundraZone", new BufferAttribute(tundraZones, 1));
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
  if (detailMaps.sandColorMap && detailMaps.tundraColorMap) {
    const sandMapUniform = { value: detailMaps.sandColorMap };
    const tundraMapUniform = { value: detailMaps.tundraColorMap };
    material.onBeforeCompile = (shader): void => {
      shader.uniforms.sandColorMap = sandMapUniform;
      shader.uniforms.tundraColorMap = tundraMapUniform;

      // Vertex shader: pass the raw world-coord uv (= camX + tileOffsetX + i,
      // see rebuild()) through as `vTerrainWorldUv` so the fragment shader
      // can recover which world tile a pixel belongs to via floor(). Also
      // pass the forestZone attribute (corner-averaged forest proximity)
      // for the dark-grass halo around tree tiles, and tundraZone (see its
      // declaration above) for the explicit tundra mask.
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
attribute float forestZone;
attribute float tundraZone;
varying vec2 vTerrainWorldUv;
varying float vForestZone;
varying float vTundraZone;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
vTerrainWorldUv = uv;
vForestZone = forestZone;
vTundraZone = tundraZone;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
uniform sampler2D sandColorMap;
uniform sampler2D tundraColorMap;
varying vec2 vTerrainWorldUv;
varying float vForestZone;
varying float vTundraZone;`
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
        vec4 tundraSample = texture2D( tundraColorMap, sampleUv );
        float greenBias = vColor.g - 0.5 * (vColor.r + vColor.b);
        // Soft-narrow biome cut: 0.03-wide blend zone, just enough to
        // antialias the seam without a visible mid-blend band of
        // muddy-green-into-tan. TUNDRA's pale palette sits too close to
        // SAND's in this color-inferred space to tell apart the same way,
        // so it uses an explicit per-vertex mask (vTundraZone, set from the
        // real tile kind in rebuild()) instead, blended in on top last.
        float grassMask = smoothstep(0.055, 0.085, greenBias);
        vec3 biomeColor = mix(sandSample.rgb, grassSample.rgb, grassMask);
        float tundraMask = smoothstep(0.4, 0.6, vTundraZone);
        biomeColor = mix(biomeColor, tundraSample.rgb, tundraMask);

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

  // Gridlines: a LineSegments with its own position buffer, offset a hair
  // above the main heightfield's (GRID_Y_EPSILON). A hill tile's boundary
  // sits at exactly the same Y as the dome mesh's own flat outer collar
  // (domeFalloff is 0 at the tile edge by construction — see
  // client-map-3d-hills.ts), so sharing the main buffer put the grid line
  // and the dome's opaque collar triangles at the identical depth: a
  // coplanar tie the line consistently lost, leaving hill tiles with no
  // visible grid square around them. The epsilon is far below any real
  // terrain height difference, so lines are still correctly hidden behind
  // actually-taller geometry (mountains, buildings) elsewhere.
  const GRID_Y_EPSILON = 0.003;
  const gridGeometry = new BufferGeometry();
  const gridPositions = new Float32Array(VERT_COUNT * 3);
  gridGeometry.setAttribute("position", new BufferAttribute(gridPositions, 3));
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
      isForestAt,
      isHillsAt
    } = inputs;
    const exploredAt = isExploredAt ?? ((): boolean => true);
    const forestAt = isForestAt ?? ((): boolean => false);
    const hillsAt = isHillsAt ?? ((): boolean => false);

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
      readonly isHills: boolean;
      readonly isTundra: boolean;
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
      // Excluded from land averaging below (s00Land etc.) — hills render as
      // their own dome mesh (client-map-3d-hills.ts), so a flat neighbour
      // never rises.
      const isHillsTile = (kind === "GRASS" || kind === "SAND" || kind === "TUNDRA") && hillsAt(wx, wy);
      const hillsBonus = isHillsTile ? HEIGHTFIELD_HILLS_ELEVATION_BONUS : 0;
      const baseElevation = heightfieldTileBaseElevation(kind) + hillsBonus;
      const elevation = baseElevation + elevationJitter(wx, wy, kind);
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
        isHills: isHillsTile,
        isTundra: kind === "TUNDRA",
        forestProx
      };
      tileSampleCache.set(cacheKey, sample);
      elevationCache.set(elevationKey(wx, wy), baseElevation);
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
        // Hills tiles are excluded from "land" here (see isHillsTile above)
        // so a flat neighbour's corner is only ever averaged against other
        // flat land — it never rises just because a hills tile touches it.
        const s00Land = s00.isExplored && !s00.isSea && !s00.isHills;
        const s10Land = s10.isExplored && !s10.isSea && !s10.isHills;
        const s01Land = s01.isExplored && !s01.isSea && !s01.isHills;
        const s11Land = s11.isExplored && !s11.isSea && !s11.isHills;
        const s00Sea = s00.isExplored && s00.isSea;
        const s10Sea = s10.isExplored && s10.isSea;
        const s01Sea = s01.isExplored && s01.isSea;
        const s11Sea = s11.isExplored && s11.isSea;
        const landCount =
          (s00Land ? 1 : 0) + (s10Land ? 1 : 0) + (s01Land ? 1 : 0) + (s11Land ? 1 : 0);
        const seaCount =
          (s00Sea ? 1 : 0) + (s10Sea ? 1 : 0) + (s01Sea ? 1 : 0) + (s11Sea ? 1 : 0);
        // Hills count as neither land nor sea above (by design — a flat
        // neighbour's corner must never average against a hill's raised
        // elevation), but they ARE explored. A corner deep inside a large
        // hills cluster (every one of its 4 tiles a hill, common once hills
        // cluster into highland regions) has landCount=0 and seaCount=0 —
        // using landCount+seaCount here mistook that for "nothing explored
        // touches this corner" and pinned it to the deep-sea-floor
        // placeholder, tens of units below the actual dome surface. That
        // silently broke cornerYAt() for those corners (gridlines resting
        // on the sea floor instead of the hill, and any overlay anchored via
        // cornerYAt sinking the same way).
        const exploredCount =
          (s00.isExplored ? 1 : 0) + (s10.isExplored ? 1 : 0) + (s01.isExplored ? 1 : 0) + (s11.isExplored ? 1 : 0);
        let elevation: number;
        let r: number;
        let g: number;
        let b: number;
        if (exploredCount === 0) {
          // Nothing explored touches this corner; vertex won't be drawn
          // (all surrounding tiles are skipped in the index buffer), so
          // values here are placeholders.
          elevation = seaFloorFallbackY;
          r = (s00.r + s10.r + s01.r + s11.r) * 0.25;
          g = (s00.g + s10.g + s01.g + s11.g) * 0.25;
          b = (s00.b + s10.b + s01.b + s11.b) * 0.25;
        } else if (landCount === 0) {
          // Explored but no *flat* land (sea and/or hills only). Not drawn
          // by any triangle, but cornerYAt still reads the cache, so
          // average the explored tiles instead of a bogus sea-floor Y.
          // Hill samples' elevation includes HEIGHTFIELD_HILLS_ELEVATION_BONUS
          // (see sampleTile) but the dome's own corner fallback
          // (flatCorner's inner "no flat neighbour" branch in
          // client-map-3d-hills.ts) averages the bonus-free base elevation —
          // subtract it back out here so a deep-cluster corner matches the
          // dome's true tapered-to-zero edge instead of floating above it.
          const explored: TileSample[] = [s00, s10, s01, s11].filter((s) => s.isExplored);
          const invFallback = 1 / explored.length;
          elevation = explored.reduce((sum, s) => sum + (s.isHills ? s.elevation - HEIGHTFIELD_HILLS_ELEVATION_BONUS : s.elevation), 0) * invFallback;
          r = explored.reduce((sum, s) => sum + s.r, 0) * invFallback;
          g = explored.reduce((sum, s) => sum + s.g, 0) * invFallback;
          b = explored.reduce((sum, s) => sum + s.b, 0) * invFallback;
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
          elevation = coastCornerElevation(s00, s10, s01, s11, coastEdgeY);
          r = landR * (1 - beachMix) + beachR * beachMix;
          g = landG * (1 - beachMix) + beachG * beachMix;
          b = landB * (1 - beachMix) + beachB * beachMix;
        }
        const baseIdx = (j * VERT_DIM + i) * 3;
        positions[baseIdx + 0] = tileOffsetX + i;
        positions[baseIdx + 1] = elevation;
        positions[baseIdx + 2] = tileOffsetY + j;
        gridPositions[baseIdx + 0] = tileOffsetX + i;
        gridPositions[baseIdx + 1] = elevation + GRID_Y_EPSILON;
        gridPositions[baseIdx + 2] = tileOffsetY + j;
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
        tundraZones[vertIdx] =
          ((s00.isTundra ? 1 : 0) + (s10.isTundra ? 1 : 0) + (s01.isTundra ? 1 : 0) + (s11.isTundra ? 1 : 0)) * 0.25;
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
    // sit on top. Hills tiles are skipped the same way — their footprint
    // is covered by client-map-3d-hills.ts's own dome mesh instead.
    {
      let idxCount = 0;
      for (let j = 0; j < tileSpanY; j += 1) {
        for (let i = 0; i < tileSpanX; i += 1) {
          const sample = sampleTile(i, j);
          if (sample.isSea || !sample.isExplored || sample.isHills) continue;
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
      if (indexAttr) {
        // Only the first idxCount entries were written this rebuild (the rest
        // of the fixed MAX_INDEX_COUNT-sized buffer is stale from a larger
        // previous window) — an unranged needsUpdate reuploads the whole
        // buffer via bufferSubData every rebuild, which dominates the main
        // thread during a zoom/pan gesture (see PR description).
        indexAttr.clearUpdateRanges();
        indexAttr.addUpdateRange(0, idxCount);
        indexAttr.needsUpdate = true;
      }
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
          if (sample.isSea || !sample.isExplored || sample.isHills) continue;
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
      const skirtPosAttr = skirtGeometry.getAttribute("position") as BufferAttribute | undefined;
      const skirtColorAttr = skirtGeometry.getAttribute("color") as BufferAttribute | undefined;
      const skirtNormalAttr = skirtGeometry.getAttribute("normal") as BufferAttribute | undefined;
      const skirtIndexAttr = skirtGeometry.index;
      // skirtPositions/Colors/Normals are allocated at MAX_SKIRT_EDGES*4*3
      // (worst-case coastline for a full HEIGHTFIELD_MAX_TILES_PER_AXIS
      // window, ~11MB per attribute) but only skirtVertCount*3 items were
      // written this rebuild. An unranged needsUpdate reuploads the entire
      // ~33MB across the three attributes via bufferSubData every rebuild —
      // this was the dominant cost during zoom (bufferSubData was >60% of
      // main-thread samples in a zoom-gesture CPU profile).
      const skirtItemCount = skirtVertCount * 3;
      if (skirtPosAttr) {
        skirtPosAttr.clearUpdateRanges();
        skirtPosAttr.addUpdateRange(0, skirtItemCount);
        skirtPosAttr.needsUpdate = true;
      }
      if (skirtColorAttr) {
        skirtColorAttr.clearUpdateRanges();
        skirtColorAttr.addUpdateRange(0, skirtItemCount);
        skirtColorAttr.needsUpdate = true;
      }
      if (skirtNormalAttr) {
        skirtNormalAttr.clearUpdateRanges();
        skirtNormalAttr.addUpdateRange(0, skirtItemCount);
        skirtNormalAttr.needsUpdate = true;
      }
      if (skirtIndexAttr) {
        skirtIndexAttr.clearUpdateRanges();
        skirtIndexAttr.addUpdateRange(0, skirtIdxCount);
        skirtIndexAttr.needsUpdate = true;
      }
      skirtGeometry.setDrawRange(0, skirtIdxCount);
    }

    // Vertices are written row-major (baseIdx = (j*VERT_DIM+i)*itemSize) for
    // j in [0, vertSpanY) and i in [0, vertSpanX), so every written index
    // falls within the first vertSpanY*VERT_DIM vertices even though each
    // row only fills the first vertSpanX of its VERT_DIM columns. That's
    // still a small fraction of the fixed VERT_COUNT=241*241 allocation at
    // any zoom short of the full 240-tile window, so range the upload to it
    // instead of reuploading the whole buffer (see skirt buffers above for
    // why this matters — same pattern, smaller buffers).
    const writtenVertCount = vertSpanY * VERT_DIM;
    const positionAttr = geometry.attributes.position as BufferAttribute | undefined;
    const colorAttr = geometry.attributes.color as BufferAttribute | undefined;
    const uvAttr = geometry.attributes.uv as BufferAttribute | undefined;
    const forestAttr = geometry.attributes.forestZone as BufferAttribute | undefined;
    const tundraAttr = geometry.attributes.tundraZone as BufferAttribute | undefined;
    const normalAttr = geometry.attributes.normal as BufferAttribute | undefined;
    if (positionAttr) {
      positionAttr.clearUpdateRanges();
      positionAttr.addUpdateRange(0, writtenVertCount * 3);
      positionAttr.needsUpdate = true;
    }
    if (colorAttr) {
      colorAttr.clearUpdateRanges();
      colorAttr.addUpdateRange(0, writtenVertCount * 3);
      colorAttr.needsUpdate = true;
    }
    if (uvAttr) {
      uvAttr.clearUpdateRanges();
      uvAttr.addUpdateRange(0, writtenVertCount * 2);
      uvAttr.needsUpdate = true;
    }
    if (forestAttr) {
      forestAttr.clearUpdateRanges();
      forestAttr.addUpdateRange(0, writtenVertCount);
      forestAttr.needsUpdate = true;
    }
    if (tundraAttr) {
      tundraAttr.clearUpdateRanges();
      tundraAttr.addUpdateRange(0, writtenVertCount);
      tundraAttr.needsUpdate = true;
    }
    geometry.setDrawRange(0, lastIndexCount);
    accumulateHeightfieldNormals(positions, indices, lastIndexCount, normals, VERT_COUNT);
    if (normalAttr) {
      normalAttr.clearUpdateRanges();
      normalAttr.addUpdateRange(0, writtenVertCount * 3);
      normalAttr.needsUpdate = true;
    }

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
      if (gridIndexAttr) {
        gridIndexAttr.clearUpdateRanges();
        gridIndexAttr.addUpdateRange(0, gridIdx);
        gridIndexAttr.needsUpdate = true;
      }
      gridLastTileSpanX = tileSpanX;
      gridLastTileSpanY = tileSpanY;
    }
    if (gridlines.visible) {
      // gridPositions mirrors `positions` (written by the same loop above),
      // so it shares the same written-range bound.
      const gridPosAttr = gridGeometry.getAttribute("position") as BufferAttribute | undefined;
      if (gridPosAttr) {
        gridPosAttr.clearUpdateRanges();
        gridPosAttr.addUpdateRange(0, writtenVertCount * 3);
        gridPosAttr.needsUpdate = true;
      }
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

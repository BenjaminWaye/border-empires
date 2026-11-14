// Seam-free per-tile texture variation for the terrain shader
// (client-map-3d-heightfield-shader.ts). Every world tile samples the painted
// grass/sand/tundra textures through its own hashed 90° rotation + offset, so
// the eye stops noticing the texture repeat. On its own that left a hard
// texture seam on every tile edge: the textures carry low-frequency mottling,
// so the land read as a grid of straight lines -- along beaches, along sandy
// hill rows, and broken corners where sand meets tundra. Here each tile's
// mapping is carried a little past its edges and cross-faded with its
// neighbours' over a narrow band (TERRAIN_TILE_SEAM_BLEND), meeting at an
// even 50/50 on the edge itself, so the texture is continuous across every
// tile edge and corner. The tile interior (most of it) still samples only its
// own mapping. terrainTileSeamWeights mirrors the GLSL weights for tests.

/** Half-width of the cross-fade band either side of a tile edge, in tiles. */
export const TERRAIN_TILE_SEAM_BLEND = 0.3;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** One axis: the neighbour tile's weight at `f` (0..1 across the tile), and which side it is on. */
const axisWeight = (f: number): { readonly side: -1 | 1; readonly weight: number } => ({
  side: f < 0.5 ? -1 : 1,
  weight: 0.5 * (1 - smoothstep(0, TERRAIN_TILE_SEAM_BLEND, Math.min(f, 1 - f)))
});

/**
 * Per world tile, the weight each tile's texture mapping gets at world point
 * (u, v) -- mirrors TERRAIN_TILE_BLEND_GLSL. Keys are "tx,ty"; weights sum to 1.
 */
export const terrainTileSeamWeights = (u: number, v: number): ReadonlyMap<string, number> => {
  const tx = Math.floor(u);
  const ty = Math.floor(v);
  const x = axisWeight(u - tx);
  const y = axisWeight(v - ty);
  const weights = new Map<string, number>();
  const add = (dx: number, dy: number, w: number): void => {
    if (w <= 0) return;
    const key = `${tx + dx},${ty + dy}`;
    weights.set(key, (weights.get(key) ?? 0) + w);
  };
  add(0, 0, (1 - x.weight) * (1 - y.weight));
  add(x.side, 0, x.weight * (1 - y.weight));
  add(0, y.side, (1 - x.weight) * y.weight);
  add(x.side, y.side, x.weight * y.weight);
  return weights;
};

const glslFloat = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/**
 * Declared at fragment scope. terrainTileSampleUv: a world point's texture UV
 * through tile `tileId`'s rotation + offset (valid past the tile's edges, so a
 * neighbour's mapping carries on smoothly). terrainTileSampleGrad rotates a
 * screen-space UV derivative the same way, for textureGrad: the neighbour
 * samples sit in non-uniform branches, where implicit derivatives are undefined.
 */
export const TERRAIN_TILE_BLEND_GLSL = `
mat2 terrainTileRotation(vec2 tileId) {
  float h1 = fract(sin(dot(tileId, vec2(12.9898, 78.233))) * 43758.5453);
  float angle = floor(h1 * 4.0) * 1.5707963267948966;
  float ca = cos(angle);
  float sa = sin(angle);
  return mat2(ca, -sa, sa, ca);
}
vec2 terrainTileSampleUv(vec2 tileId, vec2 worldUv) {
  float h2 = fract(sin(dot(tileId, vec2(63.7264, 10.873))) * 43758.5453);
  vec2 rotated = terrainTileRotation(tileId) * (worldUv - tileId - 0.5) + 0.5;
  vec2 offset = vec2(h2 * 8.0, fract(h2 * 7.31) * 8.0);
  // 1/tilesPerRepeat (8) puts it back into texture-local UV; the textures
  // use RepeatWrapping so any value samples cleanly.
  return (tileId + rotated + offset) * 0.125;
}
void terrainTileAccumulate(vec2 tileId, float weight, vec2 worldUv, vec2 dUdx, vec2 dUdy, sampler2D grassMap, inout vec4 grass, inout vec4 sand, inout vec4 tundra) {
  vec2 sampleUv = terrainTileSampleUv(tileId, worldUv);
  mat2 rotation = terrainTileRotation(tileId);
  vec2 gx = rotation * dUdx * 0.125;
  vec2 gy = rotation * dUdy * 0.125;
  grass += textureGrad(grassMap, sampleUv, gx, gy) * weight;
  sand += textureGrad(sandColorMap, sampleUv, gx, gy) * weight;
  tundra += textureGrad(tundraColorMap, sampleUv, gx, gy) * weight;
}
`;

/**
 * Inside <map_fragment>: declares grassSample / sandSample / tundraSample, each
 * the seam-blended sample of its texture at vTerrainWorldUv.
 */
export const TERRAIN_TILE_SAMPLES_GLSL = `
      vec2 tileId = floor(vTerrainWorldUv);
      vec2 inTile = vTerrainWorldUv - tileId;
      vec2 seamSide = step(0.5, inTile) * 2.0 - 1.0;
      vec2 seamW = 0.5 * (1.0 - smoothstep(0.0, ${glslFloat(TERRAIN_TILE_SEAM_BLEND)}, min(inTile, 1.0 - inTile)));
      vec2 terrainUvDx = dFdx(vTerrainWorldUv);
      vec2 terrainUvDy = dFdy(vTerrainWorldUv);
      vec4 grassSample = vec4(0.0);
      vec4 sandSample = vec4(0.0);
      vec4 tundraSample = vec4(0.0);
      terrainTileAccumulate(tileId, (1.0 - seamW.x) * (1.0 - seamW.y), vTerrainWorldUv, terrainUvDx, terrainUvDy, map, grassSample, sandSample, tundraSample);
      if (seamW.x > 0.0) terrainTileAccumulate(tileId + vec2(seamSide.x, 0.0), seamW.x * (1.0 - seamW.y), vTerrainWorldUv, terrainUvDx, terrainUvDy, map, grassSample, sandSample, tundraSample);
      if (seamW.y > 0.0) terrainTileAccumulate(tileId + vec2(0.0, seamSide.y), (1.0 - seamW.x) * seamW.y, vTerrainWorldUv, terrainUvDx, terrainUvDy, map, grassSample, sandSample, tundraSample);
      if (seamW.x > 0.0 && seamW.y > 0.0) terrainTileAccumulate(tileId + seamSide, seamW.x * seamW.y, vTerrainWorldUv, terrainUvDx, terrainUvDy, map, grassSample, sandSample, tundraSample);`;

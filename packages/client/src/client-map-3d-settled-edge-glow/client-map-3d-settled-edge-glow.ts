import { BufferAttribute, type BufferGeometry, type MeshBasicMaterial } from "three";

// Settled-territory edge glow for the 3D ownership overlay: a settled tile's
// tint is strongest (rimOpacity) where it meets anything that isn't the same
// owner's settled land, fades smoothly to interiorOpacity over widthTiles,
// and a thin darker owner-colour line traces the boundary itself. The fade is
// computed per pixel from each tile's 8-neighbour mask, so it runs straight
// across tile seams instead of stepping per tile (a per-tile step would read
// as a tile state rather than lighting).
//
// widthTiles is capped at 1: the mask only knows a tile's immediate
// neighbours, and any boundary closer than one tile to a pixel is
// necessarily one of them, so distances below 1 are exact and the fade lands
// on interiorOpacity exactly where an unflagged interior tile begins.

export type SettledEdgeGlow = {
  readonly rimOpacity: number;
  readonly interiorOpacity: number;
  readonly widthTiles: number;
  // Boundary line half-width, in tiles. 0 disables the line.
  readonly lineTiles: number;
  // Line colour = owner colour * lineDarken.
  readonly lineDarken: number;
};

export const DEFAULT_SETTLED_EDGE_GLOW: SettledEdgeGlow = {
  rimOpacity: 0.85,
  interiorOpacity: 0.35,
  widthTiles: 1,
  lineTiles: 0.035,
  lineDarken: 0.55
};

// Bit per neighbour that is NOT the same owner's settled land. Tile-local
// axes: u runs west->east (wx), v runs north->south (wy), matching the
// overlay's corner00 = (wx, wy) quad layout.
export const EDGE_N = 1;
export const EDGE_E = 2;
export const EDGE_S = 4;
export const EDGE_W = 8;
export const EDGE_NE = 16;
export const EDGE_SE = 32;
export const EDGE_SW = 64;
export const EDGE_NW = 128;

const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, EDGE_N], [1, 0, EDGE_E], [0, 1, EDGE_S], [-1, 0, EDGE_W],
  [1, -1, EDGE_NE], [1, 1, EDGE_SE], [-1, 1, EDGE_SW], [-1, -1, EDGE_NW]
];

// isSameSettled receives unwrapped neighbour coords; the caller wraps them.
export const settledEdgeMaskAt = (wx: number, wy: number, isSameSettled: (nx: number, ny: number) => boolean): number => {
  let mask = 0;
  for (const [dx, dy, bit] of NEIGHBOURS) {
    if (!isSameSettled(wx + dx, wy + dy)) mask |= bit;
  }
  return mask;
};

export type EdgeGlowBuffers = {
  readonly uv: Float32Array;
  readonly mask: Float32Array;
};

export const createEdgeGlowBuffers = (geometry: BufferGeometry, vertCount: number): EdgeGlowBuffers => {
  const uv = new Float32Array(vertCount * 2);
  const mask = new Float32Array(vertCount);
  geometry.setAttribute("edgeUv", new BufferAttribute(uv, 2));
  geometry.setAttribute("edgeMask", new BufferAttribute(mask, 1));
  return { uv, mask };
};

export const writeEdgeGlowVertex = (buffers: EdgeGlowBuffers, vertex: number, u: number, v: number, mask: number): void => {
  buffers.uv[vertex * 2] = u;
  buffers.uv[vertex * 2 + 1] = v;
  buffers.mask[vertex] = mask;
};

// Same scoped-upload pattern as the overlay's own position/color buffers.
export const commitEdgeGlowBuffers = (geometry: BufferGeometry, vertCount: number): void => {
  for (const [name, itemSize] of [["edgeUv", 2], ["edgeMask", 1]] as const) {
    const attr = geometry.getAttribute(name) as BufferAttribute | undefined;
    if (!attr) continue;
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, vertCount * itemSize);
    attr.needsUpdate = true;
  }
};

const glsl = (value: number): string => value.toFixed(4);

// Replaces the material's flat opacity with the edge-distance ramp. Only
// meaningful for NormalBlending (multiply ignores alpha).
export const attachSettledEdgeGlow = (material: MeshBasicMaterial, glow: SettledEdgeGlow): void => {
  const width = Math.min(1, Math.max(0.05, glow.widthTiles));
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec2 edgeUv;
attribute float edgeMask;
varying vec2 vEdgeUv;
varying float vEdgeMask;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vEdgeUv = edgeUv;
vEdgeMask = edgeMask;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vEdgeUv;
varying float vEdgeMask;
float edgeBit( float m, float b ) { return mod( floor( m / b ), 2.0 ); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  float m = floor( vEdgeMask + 0.5 );
  vec2 uv = vEdgeUv;
  float d = 2.0;
  if ( edgeBit( m, 1.0 ) > 0.5 ) d = min( d, uv.y );
  if ( edgeBit( m, 2.0 ) > 0.5 ) d = min( d, 1.0 - uv.x );
  if ( edgeBit( m, 4.0 ) > 0.5 ) d = min( d, 1.0 - uv.y );
  if ( edgeBit( m, 8.0 ) > 0.5 ) d = min( d, uv.x );
  if ( edgeBit( m, 16.0 ) > 0.5 ) d = min( d, length( vec2( 1.0 - uv.x, uv.y ) ) );
  if ( edgeBit( m, 32.0 ) > 0.5 ) d = min( d, length( vec2( 1.0 - uv.x, 1.0 - uv.y ) ) );
  if ( edgeBit( m, 64.0 ) > 0.5 ) d = min( d, length( vec2( uv.x, 1.0 - uv.y ) ) );
  if ( edgeBit( m, 128.0 ) > 0.5 ) d = min( d, length( uv ) );
  float fade = smoothstep( 0.0, ${glsl(width)}, d );
  float alpha = mix( ${glsl(glow.rimOpacity)}, ${glsl(glow.interiorOpacity)}, fade );
  float aa = fwidth( d );
  float line = ${glow.lineTiles > 0 ? `1.0 - smoothstep( ${glsl(glow.lineTiles)} - aa, ${glsl(glow.lineTiles)} + aa, d )` : "0.0"};
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * ${glsl(glow.lineDarken)}, line );
  diffuseColor.a = mix( alpha, 1.0, line );
}`);
  };
  material.customProgramCacheKey = () => `settled-edge-glow:${glow.rimOpacity}:${glow.interiorOpacity}:${width}:${glow.lineTiles}:${glow.lineDarken}`;
};

export type SettledEdgeNeighbourDeps = {
  readonly tiles: ReadonlyMap<string, { readonly ownerId?: string | null | undefined; readonly ownershipState?: string | undefined }>;
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
};

// The glow follows the boundary of ownerId's SETTLED land, so a settled tile
// bordering its own owner's frontier still gets the rim (frontier reads as
// outside the settled outline).
export const settledEdgeMaskForOwner = (wx: number, wy: number, ownerId: string, deps: SettledEdgeNeighbourDeps): number =>
  settledEdgeMaskAt(wx, wy, (nx, ny) => {
    const neighbour = deps.tiles.get(deps.keyFor(deps.wrapX(nx), deps.wrapY(ny)));
    return neighbour?.ownerId === ownerId && neighbour.ownershipState === "SETTLED";
  });

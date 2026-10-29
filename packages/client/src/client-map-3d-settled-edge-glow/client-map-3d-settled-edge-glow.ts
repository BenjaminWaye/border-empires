import { BufferAttribute, type BufferGeometry, type MeshBasicMaterial } from "three";
import { clampSettledEdgeGlowWidth, type SettledEdgeGlow } from "../client-settled-edge-glow/client-settled-edge-glow.js";

// 3D half of the settled-territory edge glow (see
// client-settled-edge-glow.ts for the look and the mask): per-vertex
// tile-local UV + neighbour-mask attributes and the fragment-shader patch.
// The GLSL below mirrors settledEdgeDistance/settledEdgeAlpha there.

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
  const width = clampSettledEdgeGlowWidth(glow.widthTiles);
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

import type { MeshBasicMaterial } from "three";

// Optional frontier look for the 3D ownership overlay: owner-colour diagonal
// stripes over a faint wash instead of one flat translucent tint, so frontier
// stays recognisable from a single tile even when the settled interior is
// fainter than frontier. Same stripe recipe as the incursion hatch
// (client-map-3d-incursion-overlay.ts): a whole number of stripe pairs per
// tile on tile-local UVs, so stripes run on across tile seams, and a fade to
// the average when stripes go sub-pixel to avoid moire.

export type FrontierHatch = {
  readonly stripeOpacity: number;
  readonly gapOpacity: number;
  readonly stripePairsPerTile: number;
};

export const DEFAULT_FRONTIER_HATCH: FrontierHatch = {
  stripeOpacity: 0.55,
  gapOpacity: 0.1,
  stripePairsPerTile: 4
};

const glsl = (value: number): string => value.toFixed(4);

// Reads the edgeUv attribute written by the overlay (createEdgeGlowBuffers).
export const attachFrontierHatch = (material: MeshBasicMaterial, hatch: FrontierHatch): void => {
  const pairs = Math.max(1, Math.round(hatch.stripePairsPerTile));
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec2 edgeUv;
varying vec2 vEdgeUv;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vEdgeUv = edgeUv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec2 vEdgeUv;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  float t = ( vEdgeUv.x + vEdgeUv.y ) * ${pairs.toFixed(1)};
  float tri = abs( fract( t ) - 0.5 );
  float aa = fwidth( t );
  float stripe = smoothstep( 0.25 - aa * 0.75, 0.25 + aa * 0.75, tri );
  float striped = mix( ${glsl(hatch.gapOpacity)}, ${glsl(hatch.stripeOpacity)}, stripe );
  diffuseColor.a = ( diffuseColor.a / opacity ) * mix( striped, ${glsl((hatch.gapOpacity + hatch.stripeOpacity) / 2)}, smoothstep( 0.2, 0.5, aa ) );
}`);
  };
  material.customProgramCacheKey = () => `frontier-hatch:${hatch.stripeOpacity}:${hatch.gapOpacity}:${pairs}`;
};

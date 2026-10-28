import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MultiplyBlending,
  NormalBlending
} from "three";
import { attachFrontierHatch, type FrontierHatch } from "./client-map-3d-settled-edge-glow/client-map-3d-frontier-hatch.js";
import { attachSettledEdgeGlow, createEdgeGlowBuffers, type EdgeGlowBuffers, type SettledEdgeGlow } from "./client-map-3d-settled-edge-glow/client-map-3d-settled-edge-glow.js";

// One ownership-overlay bucket (settled/frontier x flat/hill): its
// pre-allocated geometry buffers, material and blend handling. Split out of
// client-map-3d-ownership-overlay.ts, which owns tile placement and commit.

// Blends a fully-saturated owner color toward white by (1 - opacity), so a
// straight multiply against whatever's already in the framebuffer (the
// ground mesh's own lit-and-shadowed color, drawn first) reproduces the same
// look the old alpha blend gave on a FULLY-LIT tile, while a shadowed tile's
// darker ground color now multiplies through instead of being buried under
// the flat tint. See the addTile/addHillTile call sites below for why this
// needs to be baked into the vertex color rather than left to a shader.
const lerpTowardWhite = (component: number, opacity: number): number => 1 + opacity * (component - 1);

// Multiply buckets bake opacity into the vertex color (lerpTowardWhite);
// normal-blend buckets leave the color untouched and let material.opacity
// (set at mesh creation) do the transparency work instead, matching how this
// overlay behaved before the multiply-blend change.
export const colorComponentFor = (target: { opacity: number; blendMode: "multiply" | "normal" }, component: number): number =>
  target.blendMode === "multiply" ? lerpTowardWhite(component, target.opacity) : component;

// "multiply" reproduces the shadow-visible-through-tint look (see
// lerpTowardWhite's doc comment) and is what settled/owned territory uses --
// deliberately near-opaque, so a shadowed patch should darken rather than
// disappear. "normal" is the original straight alpha blend: the ground shows
// through at (1 - opacity) regardless of how dark that ground pixel is, which
// is what frontier tint and both fog-of-war overlays need -- they're meant to
// read as a translucent wash, not a multiplicative darken. Multiply always
// pushes the result darker than the ground alone (every lerped-toward-white
// channel is <= 1), so applying it somewhere meant to look "barely there"
// instead reads as a heavy, non-transparent tint.
export type BlendMode = "multiply" | "normal";

export const createMesh = (vertCount: number, indexCount: number, opacity: number, blendMode: BlendMode, edgeGlow?: SettledEdgeGlow, frontierHatch?: FrontierHatch): {
  geometry: BufferGeometry;
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  mesh: Mesh;
  material: MeshBasicMaterial;
  opacity: number;
  blendMode: BlendMode;
  edge: EdgeGlowBuffers | undefined;
} => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(indexCount);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const material = new MeshBasicMaterial({ toneMapped: false,
    color: "#ffffff",
    vertexColors: true,
    transparent: true,
    // See BlendMode's doc comment above for why this varies per bucket.
    // `opacity` only matters for "normal" -- multiply's vertex colors are
    // pre-lerped toward white by `opacity` instead (lerpTowardWhite), since
    // MultiplyBlending's GL blend func doesn't use material.opacity at all.
    opacity,
    blending: blendMode === "multiply" ? MultiplyBlending : NormalBlending,
    // MultiplyBlending's GL blend func ignores alpha, so this has no visual
    // effect here -- it only silences THREE.WebGLState's per-frame console
    // warning that MultiplyBlending requires premultipliedAlpha.
    premultipliedAlpha: blendMode === "multiply",
    depthWrite: false,
    // depthTest was previously disabled to keep the overlay visible on
    // top of hill domes, back when hill tiles used one flat bridging
    // plane that sank below the dome's peak. addHillTile now drapes the
    // overlay as a constant-offset parallel of the dome's own mesh (same
    // SUBDIV, same per-vertex formula, same triangulation — see
    // HILL_SUBDIV above), so it always sits above the terrain and depth
    // testing can stay on. With it off, the overlay ignored the depth
    // buffer entirely and painted over every opaque object on screen —
    // including towns/structures standing on the tile — tinting them
    // instead of just the ground beneath them.
    side: DoubleSide
  });
  // Both styles replace material.opacity per pixel, so neither applies to
  // a multiply bucket (whose opacity is baked into the vertex colour).
  const edge = (edgeGlow || frontierHatch) && blendMode === "normal" ? createEdgeGlowBuffers(geometry, vertCount) : undefined;
  if (edge && edgeGlow) attachSettledEdgeGlow(material, edgeGlow);
  else if (edge && frontierHatch) attachFrontierHatch(material, frontierHatch);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { geometry, positions, colors, indices, mesh, material, opacity, blendMode, edge };
};

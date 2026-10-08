// River water's own material (it used to borrow the ocean's). The ocean
// material is see-through at 0.78 opacity with pale colours, which made the
// river read as a film floating over the ground and territory tint
// (docs/rivers-remake-plan.md, Phase 0 findings). River water is dark,
// saturated blue-teal, opaque at its core, with a soft alpha only at the
// outer edge where it meets the bank.
import { Color, DoubleSide, MeshStandardMaterial } from "three";

export type Rgba = readonly [number, number, number, number];

// Core: deep, saturated blue-teal (Civ-style reference look).
export const RIVER_WATER_CORE: Rgba = [0.08, 0.27, 0.36, 1];
// Shallow band toward the bank, still opaque.
export const RIVER_WATER_SHALLOW: Rgba = [0.11, 0.33, 0.4, 1];
// Outermost edge: fades out so the water meets the wet bank softly.
export const RIVER_WATER_EDGE: Rgba = [0.12, 0.3, 0.33, 0.35];

// What the river blends toward as it spills into the sea: matched to how
// the lit, part-transparent ocean renders near the coast (river water and
// sea then meet without a colour step).
export const RIVER_SEA_BLEND: Rgba = [0.15, 0.37, 0.44, 1];

// v1-v8 strip has no per-vertex colours: one flat colour, the core's.
export const RIVER_WATER_FLAT_COLOR = new Color(RIVER_WATER_CORE[0], RIVER_WATER_CORE[1], RIVER_WATER_CORE[2]);

/**
 * `vertexColors` = true expects an RGBA `color` attribute (v9 water);
 * false draws one opaque flat colour (v1-v8 strip).
 */
export const createRiverWaterMaterial = (vertexColors: boolean): MeshStandardMaterial =>
  new MeshStandardMaterial({
    color: vertexColors ? new Color(1, 1, 1) : RIVER_WATER_FLAT_COLOR,
    vertexColors,
    roughness: 0.22,
    metalness: 0.08,
    // Transparent only so it sorts into the transparent pass by renderOrder
    // (RENDER_ORDER.riverWater): it must draw after the ownership fill and
    // before fog-darken. Opacity stays 1; only the edge vertices fade.
    transparent: true,
    opacity: 1,
    // v9 water writes depth, so overlapping water on a tight bend doesn't
    // stack into darker rings; it sits down in its trench, below the
    // fog-darken quads, which still pass the depth test. The v1-v8 strip is
    // one opaque colour (nothing to stack) and lies just above the ground
    // and the fog quads, so it must not write depth or fog couldn't darken it.
    depthWrite: vertexColors,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: DoubleSide
  });

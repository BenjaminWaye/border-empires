// The darken/restore half of the selective-bloom technique described in
// client-map-3d-bloom-layer.ts, split out from client-map-3d-bloom-pipeline.ts
// specifically so it's testable: this only touches Object3D/Material graphs,
// no live WebGLRenderer/GPU context, unlike the EffectComposer wiring that
// has to live in the pipeline file.

import { Material, MeshBasicMaterial, Object3D } from "three";
import { BLOOM_LAYER } from "./client-map-3d-bloom-layer.js";

const BLOOM_LAYER_MASK = 1 << BLOOM_LAYER;

export type MaterialBearer = Object3D & { material: Material | Material[] };

// Meshes and Sprites both carry `.material`; Line/LineSegments objects
// (selection ring outlines, gridlines, targeting reticle borders) are
// deliberately not handled here — their ~1px screen footprint means even an
// undarkened bright line contributes negligible area to the bloom buffer,
// unlike a filled badge, pennant, or targeting-reticle fill. If a future
// addition puts a large or bright Line-based element in the scene, this
// assumption needs revisiting.
export const isMaterialBearer = (obj: Object3D): obj is MaterialBearer =>
  (obj as { isMesh?: boolean }).isMesh === true || (obj as { isSprite?: boolean }).isSprite === true;

export const isBloomTagged = (obj: Object3D): boolean => (obj.layers.mask & BLOOM_LAYER_MASK) !== 0;

// A mesh's material can be a single Material or an array (multi-material
// mesh); this codebase doesn't currently use the array form anywhere in the
// 3D map, but the type allows it, so this picks the first entry as
// representative rather than assuming array inputs never happen.
export const originalDepthWrite = (material: Material | Material[]): boolean =>
  Array.isArray(material) ? (material[0]?.depthWrite ?? true) : material.depthWrite;

export type DarkenController = {
  readonly darkenNonBloomed: (obj: Object3D) => void;
  readonly restoreMaterial: (obj: Object3D) => void;
  readonly dispose: () => void;
};

// Two dark materials, not one, chosen per-object by the original material's
// `depthWrite` — most of this codebase's overlays (ownership tint, fog
// quads, badges, selection markers) are `depthWrite: false` so they never
// occlude anything behind them; a single opaque `depthWrite: true` stand-in
// would flip that during just the bloom-source pass and could wrongly cull a
// bloom-tagged object (the water, say) sitting behind one of them in that
// one render. Matching the original's depthWrite keeps this pass's
// occlusion behavior consistent with the normal pass instead of introducing
// a bloom-only depth bug.
//
// toneMapped: false on both — see client-map-3d-render-target.ts's
// tone-mapping comment. This is pure black; ACES(0) = 0 regardless, but
// every unlit MeshBasicMaterial construction in this codebase sets the flag
// so the source-scanning regression guard
// (client-map-3d-tone-mapping-regression.test.ts) can trust the invariant
// holds everywhere without exceptions.
export const createDarkenController = (): DarkenController => {
  const darkMaterialOccluding = new MeshBasicMaterial({ toneMapped: false, color: 0x000000, depthWrite: true });
  const darkMaterialNonOccluding = new MeshBasicMaterial({ toneMapped: false, color: 0x000000, depthWrite: false });
  const materialCache = new Map<Object3D, Material | Material[]>();

  const darkenNonBloomed = (obj: Object3D): void => {
    if (!isMaterialBearer(obj)) return;
    if (isBloomTagged(obj)) return;
    materialCache.set(obj, obj.material);
    obj.material = originalDepthWrite(obj.material) ? darkMaterialOccluding : darkMaterialNonOccluding;
  };

  const restoreMaterial = (obj: Object3D): void => {
    const cached = materialCache.get(obj);
    if (cached === undefined) return;
    (obj as MaterialBearer).material = cached;
    materialCache.delete(obj);
  };

  const dispose = (): void => {
    darkMaterialOccluding.dispose();
    darkMaterialNonOccluding.dispose();
    materialCache.clear();
  };

  return { darkenNonBloomed, restoreMaterial, dispose };
};

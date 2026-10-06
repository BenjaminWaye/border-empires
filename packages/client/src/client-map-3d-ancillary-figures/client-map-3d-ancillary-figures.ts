import { BoxGeometry, MeshStandardMaterial } from "three";

// Ancillaries: the small dark bodies the AFC's AI drives. Shared by the 3D
// settle overlay (settlers wandering a tile) and the construction crew layer
// (docs/construction-animation-plan.md), so both read as the same "people".

// Pinprick figures. Floor at ~0.022 width: anything smaller is sub-pixel
// at typical zoom and the whole swarm rasterises into one pixel — looks
// like a single static settler. Height stays taller than width so they
// read as standing figures, not flat dots.
export const PERSON_W = 0.022;
export const PERSON_H = 0.05;
export const PERSON_D = 0.022;
export const PERSON_Y = PERSON_H * 0.5 + 0.005;

export const createAncillaryFigureAssets = (): { geometry: BoxGeometry; material: MeshStandardMaterial } => ({
  geometry: new BoxGeometry(PERSON_W, PERSON_H, PERSON_D),
  material: new MeshStandardMaterial({
    // Slight emissive lifts the dots out of shadow so they read as
    // distinct points rather than blending into the dark plate.
    color: "#0a0d12",
    emissive: "#1a1d22",
    emissiveIntensity: 0.6,
    roughness: 0.92,
    metalness: 0,
    flatShading: true
  })
});

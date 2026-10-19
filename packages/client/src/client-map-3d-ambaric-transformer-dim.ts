// Dimmed variants of the Aether Tower's glowing pieces, used while a tower is
// disabled (its OBSERVATORY record is "inactive"). The overlay writes a
// disabled tower's glow pieces into these "<key>Dim" slots instead of the lit
// ones: same geometry, but the core's emissive drops to a faint ember and the
// additive halos/beads/motes fade, so the switched-off tower reads as dark
// inside while its brass-and-iron shell stays fully shaded.

import { Material, MeshBasicMaterial, MeshStandardMaterial } from "three";

export const DIMMABLE_PIECE_KEYS = [
  "coreHalo",
  "core",
  "coreInner",
  "emitterTip",
  "spinal",
  "ringNode",
  "spireTip",
  "mote"
] as const;

const DIMMABLE = new Set<string>(DIMMABLE_PIECE_KEYS);

export const DIM_GLOW_OPACITY_SCALE = 0.18;
export const DIM_EMISSIVE_INTENSITY_SCALE = 0.1;

export const dimmedPieceKey = (key: string): string => `${key}Dim`;

// Lit key for an active tower, its dimmed counterpart for a disabled one.
export const pieceKeyFor = (key: string, dimmed: boolean): string =>
  dimmed && DIMMABLE.has(key) ? dimmedPieceKey(key) : key;

// Clone a lit material into its dimmed form. Additive glows fade by opacity;
// emissive standard materials keep their surface but lose most of the glow.
export const dimmedMaterialFor = (lit: Material): Material => {
  if (lit instanceof MeshBasicMaterial) {
    const m = lit.clone();
    m.opacity = lit.opacity * DIM_GLOW_OPACITY_SCALE;
    return m;
  }
  if (lit instanceof MeshStandardMaterial) {
    const m = lit.clone();
    m.emissiveIntensity = lit.emissiveIntensity * DIM_EMISSIVE_INTENSITY_SCALE;
    return m;
  }
  return lit.clone();
};

import { ciede2000 } from "./ciede2000.js";

// Owner decision (2026-11-27): no two empires may have colours too close to
// tell apart. A playtester read a rival's pale pink land inside their island
// as their own (#fabebe beside #f7b6d2 is CIEDE2000 9.4).
//
// Threshold: ΔE00 15. About 1 is the smallest difference a trained eye sees
// side by side; the reported mix-up was about 9.5. Territory interiors are
// drawn at 0.35 opacity (the settled rim at 0.85), which shrinks the visible
// gap to roughly a third, so 15 still leaves about 5 in the faded interior: a
// difference seen at a glance. A higher floor costs room: a greedy packing
// of sRGB fits about 67 colours at 15 but only about 32 at 20, too few for 20
// AI empires plus the humans of a sector.
export const MIN_EMPIRE_COLOR_DELTA_E = 15;

export { ciede2000, ciede2000Lab, hexToLab, type Lab } from "./ciede2000.js";

/** Perceptual distance (CIEDE2000) between two #rrggbb empire colours. */
export const empireColorDistance = (hexA: string, hexB: string): number => ciede2000(hexA, hexB);

/** True when two #rrggbb colours are too close for two empires to share a map. */
export const areEmpireColorsTooClose = (hexA: string, hexB: string): boolean =>
  ciede2000(hexA, hexB) < MIN_EMPIRE_COLOR_DELTA_E;

export type EmpireColorEntry = { readonly playerId: string; readonly name?: string | undefined; readonly color: string };

/**
 * The empire whose colour is nearest to `hex` among those closer than the
 * threshold, or undefined when `hex` is far enough from all of them.
 */
export const closestClashingEmpire = <T extends EmpireColorEntry>(hex: string, empires: Iterable<T>): T | undefined => {
  let clash: T | undefined;
  let clashDistance = MIN_EMPIRE_COLOR_DELTA_E;
  for (const empire of empires) {
    const distance = ciede2000(hex, empire.color);
    if (distance < clashDistance) {
      clash = empire;
      clashDistance = distance;
    }
  }
  return clash;
};

/** True when `hex` keeps the minimum distance from every colour in `colors`. */
export const isEmpireColorFarEnough = (hex: string, colors: Iterable<string>): boolean => {
  for (const other of colors) if (ciede2000(hex, other) < MIN_EMPIRE_COLOR_DELTA_E) return false;
  return true;
};

/** Terse rejection reason for a colour too close to `name`'s. */
export const tooCloseColorReason = (name: string | undefined): string => {
  const trimmed = name?.trim() ?? "";
  if (trimmed.length === 0) return "Too close to another empire's colour.";
  return `Too close to ${trimmed}${trimmed.endsWith("s") ? "'" : "'s"} colour.`;
};

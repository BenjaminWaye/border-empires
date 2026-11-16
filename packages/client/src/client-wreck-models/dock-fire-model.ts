// A dock set ablaze in a capture (see client-capture-aftermath.ts), burning on
// its own harbour pieces while the capturing troops hold it. Modelled in the
// quay's frame (client-map-3d-harbour/harbour-quay-model.ts:
// facing +z, the sea; y = 0 on the quay's paving) and turned with it: the
// control office's roof and a window alight, the cargo containers and the
// crane's power cell burning, the pier and the moored troop carrier on fire,
// scorched paving, embers, and smoke pouring off it all.
import { ember, flame, scorch, smokeColumn, wreckRandom, type WreckBuilders } from "./wreck-kit.js";

/** Height of the quay's paving above the harbour's base (harbour-quay-model.ts DECK). */
export const QUAY_DECK_Y = 0.085;

export const buildDockFire = (t: WreckBuilders, variant: number): void => {
  const random = wreckRandom(701 + variant);
  scorch(t, -0.02, -0.05, 0.2, random);
  scorch(t, -0.24, -0.1, 0.14, random);
  scorch(t, 0.08, 0.36, 0.12, random);
  // Control office: the roof well alight, fire showing in a window.
  flame(t, -0.27, 0.3, -0.24, 0.075, random);
  flame(t, -0.18, 0.32, -0.27, 0.06, random);
  flame(t, -0.32, 0.12, -0.11, 0.035, random);
  // Cargo containers and the crane's power cell.
  flame(t, 0.0, 0.06, -0.03, 0.075, random);
  flame(t, 0.36, 0.15, -0.18, 0.045, random);
  // The pier deck and the moored troop carrier.
  flame(t, 0.08, -0.005, 0.38, 0.065, random);
  flame(t, 0.14, -0.005, 0.47, 0.055, random);
  flame(t, -0.19, 0.04, 0.37, 0.065, random);
  for (let i = 0; i < 6; i += 1) ember(t, (random() - 0.5) * 0.7, 0.006, -0.3 + random() * 0.45, 0.006 + random() * 0.004, random, i < 2);
  smokeColumn(t, -0.24, 0.4, -0.24, 7, 1.15, random, 0.06);
  smokeColumn(t, -0.19, 0.08, 0.4, 5, 0.85, random, 0.05);
  smokeColumn(t, 0.02, 0.12, -0.03, 4, 0.7, random, 0.045);
};

// A landing slipway on a beach of the dock's landing ground, facing +z (the
// sea). Core parts (the ramp and its barge) are all a shrunk slipway keeps.
import type { HarbourModelBuilder } from "./harbour-model-builder.js";
import { cargoContainer, lampPost } from "./harbour-props.js";

// The ramp falls from the beach into the sea at this pitch.
const RAMP_PITCH = Math.atan2(0.16, 0.77);

const rampAndBarge = (b: HarbourModelBuilder): void => {
  b.frame(0, -0.02, 0.24, 0, () => {
    // Iron-plated ramp: seams, brass rails, a brass kerb along each side.
    b.box("plate", 0, 0, 0, 0.34, 0.03, 0.78);
    for (let z = -0.3; z <= 0.31; z += 0.12) b.box("ironDark", 0, 0.016, z, 0.34, 0.002, 0.004);
    for (const x of [-0.1, 0.1]) b.box("brassDark", x, 0.022, 0, 0.022, 0.014, 0.78);
    for (const x of [-0.165, 0.165]) b.box("brassDark", x, 0.01, 0, 0.012, 0.03, 0.78);
    // Armoured landing barge hauled up on the rails.
    b.frame(0, 0.06, 0.01, 0, () => {
      b.box("hull", 0, 0, 0, 0.2, 0.07, 0.32);
      for (const side of [-1, 1]) {
        b.box("hull", side * 0.095, 0.035, 0, 0.018, 0.05, 0.31, [0, 0, -side * 0.35]);
        b.box("brassDark", side * 0.11, 0.05, 0, 0.012, 0.01, 0.3);
      }
      b.box("brass", 0, -0.02, 0, 0.21, 0.006, 0.325);
      b.box("plate", 0, 0.036, 0, 0.17, 0.008, 0.28);
      b.box("stone", 0, 0.075, 0.11, 0.12, 0.07, 0.08);
      b.box("lampGlow", 0, 0.085, 0.0695, 0.09, 0.014, 0.004);
      b.box("brassDark", 0, 0.111, 0.11, 0.124, 0.004, 0.084);
      b.rod("iron", [0, 0.113, 0.12], [0, 0.19, 0.12], 0.005);
      b.cylinder("status", 0, 0.196, 0.12, 0.009, 0.012);
    });
    // Bow door lowered onto the ramp toward the beach.
    b.box("ironDark", 0, 0.05, -0.195, 0.2, 0.012, 0.1, [-0.5 + RAMP_PITCH, 0, 0]);
    for (const x of [-0.06, 0, 0.06]) b.box("brassDark", x, 0.056, -0.195, 0.006, 0.014, 0.1, [-0.5 + RAMP_PITCH, 0, 0]);
  }, RAMP_PITCH);
};

export const buildSlipway = (b: HarbourModelBuilder): void => {
  b.core(() => rampAndBarge(b));
  // Marble head where the ramp meets the beach.
  b.box("charcoalMarble", 0, 0.025, -0.2, 0.42, 0.05, 0.14);
  b.box("brass", 0, 0.054, -0.2, 0.41, 0.008, 0.13);
  b.box("blackMarble", 0, 0.064, -0.2, 0.39, 0.012, 0.11);
  // Winch hauling the barge up: housing, brass drum, cable down to the bow.
  b.box("iron", 0.21, 0.05, -0.3, 0.06, 0.1, 0.06);
  b.box("brassDark", 0.21, 0.102, -0.3, 0.066, 0.006, 0.066);
  b.cylinder("brass", 0.21, 0.07, -0.255, 0.028, 0.07, [0, 0, Math.PI / 2]);
  b.rod("ironDark", [0.21, 0.07, -0.235], [0, 0.07, 0.03], 0.004);
  // Lamp post for night landings and containers brought in by sea.
  lampPost(b, -0.22, 0, -0.3, 0.16);
  cargoContainer(b, -0.24, 0.04, -0.1, 0.13, 0.08, 0.08, 0.2, true);
  cargoContainer(b, -0.27, 0.035, 0.0, 0.11, 0.07, 0.07, -0.35, false);
};

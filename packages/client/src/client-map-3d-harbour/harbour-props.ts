// Small props shared by the harbour quay and slipways.
import type { HarbourModelBuilder } from "./harbour-model-builder.js";

/** Platform-style lamp post standing on y: blackened post, brass collar, warm lamp, brass cap. */
export const lampPost = (b: HarbourModelBuilder, x: number, y: number, z: number, height = 0.085): void => {
  b.cylinder("brassDark", x, y + 0.005, z, 0.026, 0.01);
  b.cylinder("ironDark", x, y + height / 2, z, 0.018, height);
  b.ring("brass", x, y + height, z, 0.02, 0.005);
  b.cylinder("lampGlow", x, y + height + 0.014, z, 0.014, 0.024);
  b.dome("brass", x, y + height + 0.026, z, 0.019);
};

/** Sealed cargo container centred at (x, y, z), w along its length; ribbed sides, brass end doors, optional status strip. */
export const cargoContainer = (b: HarbourModelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, ry: number, lit: boolean): void => {
  b.frame(x, y, z, ry, () => {
    b.box("crate", 0, 0, 0, w, h, d);
    const ribs = Math.max(2, Math.round(w / 0.03));
    for (let i = 1; i < ribs; i += 1) b.box("plate", -w / 2 + (w * i) / ribs, 0, 0, 0.005, h * 0.92, d + 0.004);
    for (const end of [-1, 1]) b.box("brassDark", end * (w / 2 + 0.001), 0, 0, 0.004, h * 0.9, d * 0.9);
    b.box("plate", 0, h / 2 + 0.002, 0, w * 0.96, 0.004, d * 0.96);
    if (lit) b.box("status", 0, h * 0.25, d / 2 + 0.002, w * 0.7, 0.006, 0.003);
  });
};

/** Pallet of brass fuel drums, two by two. */
export const drumPallet = (b: HarbourModelBuilder, x: number, z: number): void => {
  b.box("plate", x, 0.09, z, 0.12, 0.01, 0.12);
  for (const dx of [-0.03, 0.03]) {
    for (const dz of [-0.03, 0.03]) {
      b.cylinder("brassDark", x + dx, 0.13, z + dz, 0.026, 0.07);
      b.ring("ironDark", x + dx, 0.115, z + dz, 0.027, 0.003);
      b.ring("ironDark", x + dx, 0.145, z + dz, 0.027, 0.003);
    }
  }
};

/** Sensor mast standing on y: iron spar, brass crossbars, a small dish and a cyan tip light. */
export const sensorMast = (b: HarbourModelBuilder, x: number, y: number, z: number, height: number): void => {
  b.rod("iron", [x, y, z], [x, y + height, z], 0.006);
  for (const at of [0.62, 0.82]) b.box("brass", x, y + height * at, z, 0.05 * (1.2 - at), 0.004, 0.004);
  b.cylinder("brass", x + 0.02, y + height * 0.5, z, 0.018, 0.004, [0, 0, 0.9]);
  b.cylinder("status", x, y + height + 0.006, z, 0.008, 0.012);
};

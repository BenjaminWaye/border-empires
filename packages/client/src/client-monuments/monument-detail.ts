import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";

/** A genuinely open circular collar facing +z, rather than a filled disc. */
export const verticalCollar = (t: TownBuilders, x: number, y: number, z: number, radius: number): void => {
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10, b = (i + 1) * Math.PI / 10;
    t.body.pipe(x + Math.sin(a) * radius, y + Math.cos(a) * radius, z,
      x + Math.sin(b) * radius, y + Math.cos(b) * radius, z, 0.008, "brass");
  }
};

/** Recessed rear service hatch with a metal frame and inset readout. */
export const archiveHatch = (t: TownBuilders, x: number, z: number, height = 0.16, base = 0.10): void => {
  t.body.box(x, base, z, 0.08, height, 0.012, "ironDark");
  for (const side of [-1, 1]) t.body.box(x + side * 0.04, base, z - 0.009, 0.008, height, 0.012, "brassDark");
  t.body.box(x, base + height - 0.005, z - 0.009, 0.088, 0.008, 0.012, "brassDark");
  for (const fraction of [0.25, 0.5, 0.75]) {
    const y = base + height * fraction;
    t.body.box(x, y, z - 0.01, 0.058, 0.016, 0.006, "plate");
    t.glow.panel(x, y + 0.007, z - 0.014, 0.035, 0.005, "aether", Math.PI);
  }
};

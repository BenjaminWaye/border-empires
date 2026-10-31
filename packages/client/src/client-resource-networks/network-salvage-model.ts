import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";

/** Broken ceramic-armoured machine hoops, exposing the dark inner skeleton. */
export const salvageRib = (t: TownBuilders, x: number, z: number, radius: number): void => {
  for (let i = 0; i < 8; i += 1) {
    if ((i === 4 && z < -0.05) || (i === 6 && z > 0.05)) continue;
    const a = -0.12 + i * 0.35, b = a + 0.31;
    const point = (angle: number, r: number): readonly [number, number, number] =>
      [x + Math.cos(angle) * r, 0.02 + Math.sin(angle) * r, z];
    t.body.pipe(...point(a, radius), ...point(b, radius), 0.024, i % 3 === 0 ? "stoneDark" : "stoneLight");
    t.body.pipe(...point(a, radius * 0.83), ...point(b, radius * 0.83), 0.011, "ironDark");
    t.body.pipe(...point(a, radius * 0.83), ...point(a, radius), 0.007, "brassDark");
  }
};

/** A collapsed pre-Court power train: intact cavities, severed ribs and layered debris. */
export const buildSalvageField = (t: TownBuilders): void => {
  // Half-buried keel and segmented armour establish a long diagonal silhouette.
  t.body.tiltedBox(-0.08, -0.008, 0.015, 0.42, 0.022, 0.39, "ironDark", -0.18, 0.04);
  t.body.tiltedBox(0.14, 0.004, 0.14, 0.18, 0.018, 0.23, "stoneDark", 0.2, -0.1);
  for (const z of [-0.17, -0.035, 0.1]) salvageRib(t, -0.055, z, z === 0.1 ? 0.19 : 0.27);
  for (const side of [-1, 1]) {
    t.body.pipe(side * 0.19 - 0.055, 0.14, -0.23, side * 0.19 - 0.055, 0.14, 0.17, 0.015, "ironDark");
    for (let i = 0; i < 5; i += 1) {
      const z = -0.19 + i * 0.068;
      t.body.tiltedBox(side * 0.19 - 0.055, 0.19, z, 0.075, 0.029, 0.052, "plate", -0.12, side * 0.62);
      t.body.box(side * 0.19 - 0.055, 0.207, z, 0.035, 0.006, 0.006, "brassDark");
    }
  }
  for (const side of [-1, 1]) {
    t.body.tiltedBox(side * 0.22 - 0.055, 0.115, -0.055, 0.13, 0.022, 0.31, "stoneDark", 0.06, side * 0.9);
    t.body.tiltedBox(side * 0.16 - 0.055, 0.23, -0.13, 0.1, 0.018, 0.15, "plate", -0.09, side * 0.56);
  }
  // Recessed turbine throat: dark negative space makes the machinery legible.
  t.body.disc(-0.055, 0.13, 0.10, 0.088, 0.08, "ironDark");
  t.body.disc(-0.055, 0.13, 0.15, 0.04, 0.014, "brassDark");
  for (let i = 0; i < 9; i += 1) {
    const a = i * Math.PI * 2 / 9;
    t.body.tiltedBox(-0.055 + Math.cos(a) * 0.058, 0.13 + Math.sin(a) * 0.058, 0.16,
      0.043, 0.013, 0.012, "iron", 0, a + 0.4);
  }
  // A fallen control cabinet with missing panels, cable looms and ceramic fins.
  t.body.tiltedBox(0.23, 0.071, 0.11, 0.15, 0.14, 0.17, "ironDark", -0.3, -0.22);
  t.body.tiltedBox(0.24, 0.12, 0.12, 0.16, 0.017, 0.18, "stoneLight", -0.3, -0.22);
  for (let i = 0; i < 5; i += 1) t.body.box(0.19 + i * 0.018, 0.018, 0.222, 0.009, 0.068 - i * 0.007, 0.06, "plate", -0.25);
  for (const offset of [0, 0.016, 0.032]) {
    t.body.pipe(0.16, 0.045 + offset, 0.03, 0.1, 0.015, 0.19, 0.005, "brassDark");
    t.body.pipe(0.1, 0.015, 0.19, 0.16, 0.012, 0.26, 0.005, "iron");
  }
  // One tiny surviving status strip, deliberately quieter than a Shard site.
  t.body.box(0.222, 0.065, 0.198, 0.05, 0.015, 0.006, "window");
  t.glow.box(0.212, 0.068, 0.202, 0.012, 0.006, 0.003, "aether");
  for (const [x, z, ry] of [[-0.29, 0.19, 0.7], [0.15, -0.22, -0.4], [-0.19, 0.28, -0.2]] as const) {
    t.body.tiltedBox(x, 0.025, z, 0.1, 0.016, 0.067, "stoneLight", ry, 0.18);
    t.body.box(x, 0.009, z, 0.077, 0.012, 0.046, "ironDark", ry);
  }
};

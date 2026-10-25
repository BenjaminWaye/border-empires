import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import type { TownColor } from "../client-map-3d-town-overlay/town-mesh-builder.js";

// A thirty-degree elevation gives the weapon its own aggressive silhouette.
// Barrel coordinates follow its axis; collars and the open bore share this frame.
const axis = (z: number): number => 0.43 + z * 0.55;
const cos = 1 / Math.hypot(1, 0.55), sin = 0.55 * cos;
const collar = (t: TownBuilders, z: number, radius: number, thickness: number, color: TownColor): void => {
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, b = (i + 1) * Math.PI / 8;
    t.body.pipe(Math.sin(a) * radius, axis(z) + Math.cos(a) * radius * cos, z - Math.cos(a) * radius * sin,
      Math.sin(b) * radius, axis(z) + Math.cos(b) * radius * cos, z - Math.cos(b) * radius * sin, thickness, color);
  }
};

export const buildSovereignSiege = (t: TownBuilders): void => {
  // Deep traversing mount, broad anchored recoil beds and monumental trunnions.
  t.body.cylinder(0, 0.075, 0, 0.235, 0.255, 0.065, "ironDark", 24);
  t.body.cylinder(0, 0.14, 0, 0.225, 0.235, 0.018, "brassDark", 24);
  for (const x of [-0.18, 0.18]) {
    t.body.box(x, 0.09, -0.025, 0.105, 0.19, 0.37, "ironDark");
    t.body.tiltedBox(x, 0.19, -0.035, 0.095, 0.22, 0.16, "iron", 0, x < 0 ? -0.18 : 0.18);
    t.body.pipe(x, 0.33, -0.035, x < 0 ? -0.115 : 0.115, 0.33, -0.035, 0.079, "brassDark");
    t.body.pipe(x * 1.18, 0.33, -0.035, x * 1.24, 0.33, -0.035, 0.052, "iron");
    for (const z of [-0.155, -0.045, 0.065]) {
      t.body.box(x, 0.10, z, 0.13, 0.045, 0.055, "stoneDark");
      t.body.box(x * 1.31, 0.16, z, 0.008, 0.055, 0.025, "brass");
    }
    // Recoil pistons visibly connect the breech carriage to its anchored bed.
    t.body.pipe(x, 0.18, 0.15, x, 0.35, -0.17, 0.022, "brassDark");
    t.body.pipe(x, 0.18, 0.15, x, 0.25, 0.02, 0.028, "iron");
  }
  // Heavy rear pressure vessel. The front remains hollow all the way to it.
  t.body.pipe(0, axis(-0.235), -0.235, 0, axis(0.08), 0.08, 0.102, "ironDark");
  for (const z of [-0.20, -0.08, 0.055, 0.20, 0.315]) {
    collar(t, z, z > 0.3 ? 0.121 : 0.112, z > 0.3 ? 0.017 : 0.012, "brassDark");
  }
  // Long armoured stave barrel, with an actual recessed bore and lit rifling.
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, x = Math.sin(a) * 0.096, offset = Math.cos(a) * 0.096;
    t.body.pipe(x, axis(0.055) + offset * cos, 0.055 - offset * sin,
      x, axis(0.315) + offset * cos, 0.315 - offset * sin, 0.019, "iron");
    if (i % 4 === 2) {
      const inner = 0.073, ix = Math.sin(a) * inner, iy = Math.cos(a) * inner;
      t.glow.pipe(ix, axis(0.07) + iy * cos, 0.07 - iy * sin,
        ix, axis(0.29) + iy * cos, 0.29 - iy * sin, 0.004, "aether");
    }
  }
  // Four external accelerator spines bridge every collar rather than floating.
  for (const x of [-0.082, 0.082]) for (const side of [-1, 1]) {
    const y = side * 0.082;
    t.body.pipe(x, axis(-0.22) + y * cos, -0.22 - y * sin,
      x, axis(0.315) + y * cos, 0.315 - y * sin, 0.012, "ironDark");
    t.glow.pipe(x, axis(-0.20) + y * cos + 0.012, -0.20 - y * sin,
      x, axis(0.29) + y * cos + 0.012, 0.29 - y * sin, 0.004, "aether");
  }
  // Rear Fracture Core: a dangerous shard held inside an armoured containment cage.
  t.body.cylinder(0, 0.14, -0.235, 0.09, 0.11, 0.08, "iron", 12);
  t.glow.gem(0, 0.36, -0.235, 0.07, 0.24, "aether");
  for (const x of [-0.082, 0.082]) {
    t.body.pipe(x, 0.18, -0.235, x, 0.46, -0.235, 0.014, "brassDark");
    t.body.pipe(x, 0.46, -0.235, x * 0.45, 0.51, -0.235, 0.012, "brass");
    t.body.tiltedBox(x * 1.45, 0.30, -0.235, 0.015, 0.24, 0.09, "iron", 0, x < 0 ? -0.24 : 0.24);
  }
  t.body.pipe(-0.037, 0.51, -0.235, 0.037, 0.51, -0.235, 0.016, "brass");
};

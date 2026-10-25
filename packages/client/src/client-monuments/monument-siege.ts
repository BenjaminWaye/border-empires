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
    t.body.pipe(x * 1.2, axis(-0.035), -0.035, x < 0 ? -0.075 : 0.075, axis(-0.035), -0.035, 0.067, "brassDark");
    t.body.pipe(x * 1.18, axis(-0.035), -0.035, x * 1.24, axis(-0.035), -0.035, 0.052, "iron");
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
  // Shielded Fracture Core sits coaxially inside the breech. Only its
  // recessed rear inspection iris glows; no loose shard protrudes above it.
  t.body.pipe(0, axis(-0.315), -0.315, 0, axis(-0.19), -0.19, 0.116, "ironDark");
  collar(t, -0.30, 0.116, 0.012, "brassDark");
  collar(t, -0.20, 0.116, 0.012, "brassDark");
  t.body.pipe(0, axis(-0.327), -0.327, 0, axis(-0.31), -0.31, 0.092, "iron");
  t.glow.pipe(0, axis(-0.33), -0.33, 0, axis(-0.328), -0.328, 0.048, "aether");
  collar(t, -0.332, 0.068, 0.009, "brass");
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, x = Math.sin(a) * 0.11, y = Math.cos(a) * 0.11;
    t.body.pipe(x, axis(-0.30) + y * cos, -0.30 - y * sin,
      x, axis(-0.20) + y * cos, -0.20 - y * sin, 0.012, "iron");
  }
  // Side service plates and captive fasteners give the recoil housings scale.
  for (const side of [-1, 1]) {
    t.body.box(side * 0.2365, 0.20, -0.05, 0.008, 0.055, 0.12, "iron");
    for (const z of [-0.095, -0.005]) {
      t.body.pipe(side * 0.24, 0.214, z, side * 0.246, 0.214, z, 0.007, "brassDark");
      t.body.pipe(side * 0.24, 0.242, z, side * 0.246, 0.242, z, 0.007, "brassDark");
    }
  }
};

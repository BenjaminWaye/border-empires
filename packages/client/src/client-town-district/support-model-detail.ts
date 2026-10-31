import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import type { TownColor } from "../client-map-3d-town-overlay/town-mesh-builder.js";

// Large readable masses first; trim follows real seams, feet and load paths.
// These fittings share construction language, never a complete building.
export const housing = (t: TownBuilders, x: number, z: number, w: number, h: number, d: number): void => {
  t.body.box(x, 0.006, z, w + 0.025, 0.02, d + 0.025, "stoneLight");
  t.body.box(x, 0.026, z, w, h, d, "stone");
  t.body.box(x, h + 0.026, z, w + 0.012, 0.012, d + 0.012, "brassDark");
  t.body.box(x, h + 0.038, z, w - 0.014, 0.015, d - 0.014, "graphite");
  for (const side of [-1, 1]) {
    t.body.box(x + side * (w / 2 - 0.01), 0.026, z + d / 2, 0.018, h, 0.018, "stoneLight");
    t.body.box(x + side * w * 0.24, 0.065, z + d / 2 + 0.003, w * 0.18, h * 0.5, 0.007, "window");
    t.glow.box(x + side * w * 0.24, 0.074, z + d / 2 + 0.008, w * 0.12, h * 0.35, 0.003, "lampWarm");
  }
};

export const band = (t: TownBuilders, x: number, y: number, z: number, r: number, color: TownColor = "brass"): void => {
  t.body.cylinder(x, y, z, r, r, 0.009, color, 8);
};

export const vessel = (t: TownBuilders, x: number, z: number, r: number, h: number, color: TownColor = "iron"): void => {
  t.body.cylinder(x, 0.012, z, r + 0.012, r + 0.02, 0.025, "stoneLight", 8);
  t.body.cylinder(x, 0.037, z, r, r, h, color, 10);
  band(t, x, 0.05, z, r + 0.007);
  band(t, x, h + 0.024, z, r + 0.007);
  t.body.dome(x, h + 0.037, z, r, "graphite", 10, 0.55);
  for (const side of [-1, 1]) t.body.box(x + side * r * 0.7, 0.06, z + r * 0.76, 0.009, h * 0.8, 0.012, "brassDark");
};

export const ribs = (t: TownBuilders, x: number, y: number, z: number, w: number, count: number, h = 0.04, d = 0.06): void => {
  t.body.box(x, y, z, w, h, d, "ironDark");
  for (let i = 0; i < count; i += 1) t.body.box(x - w / 2 + (i + 0.5) * w / count, y, z, 0.006, h + 0.008, d + 0.01, "brassDark");
};

export const gantry = (t: TownBuilders, x: number, z: number, w: number, h: number, depth = 0.08): void => {
  for (const side of [-1, 1]) {
    const px = x + side * w / 2;
    t.body.box(px, 0.01, z, 0.045, 0.024, depth + 0.03, "stoneLight");
    t.body.box(px, 0.034, z, 0.022, h, depth, "iron");
    t.body.box(px, 0.034, z + depth / 2 + 0.003, 0.008, h, 0.008, "brass");
  }
  t.body.box(x, h + 0.025, z, w + 0.06, 0.034, depth + 0.015, "iron");
  t.body.box(x, h + 0.03, z + depth / 2 + 0.01, w + 0.06, 0.012, 0.008, "brass");
  t.body.pipe(x - w / 2, 0.04, z, x + w / 2, h + 0.025, z, 0.006, "brassDark");
};

export const loadingDoor = (t: TownBuilders, x: number, z: number, w: number, h: number): void => {
  t.body.box(x, 0.027, z, w + 0.025, h + 0.014, 0.012, "brassDark");
  t.body.box(x, 0.028, z + 0.008, w, h, 0.006, "ironDark");
  for (let i = 1; i < 4; i += 1) t.body.box(x, 0.028 + h * i / 4, z + 0.013, w, 0.004, 0.005, "iron");
  t.body.box(x, 0.005, z + 0.026, w + 0.04, 0.018, 0.055, "paving");
};

export const processLine = (t: TownBuilders, x: number, z: number, length: number, color: TownColor = "stoneLight"): void => {
  t.body.box(x, 0.025, z, length, 0.025, 0.075, "ironDark");
  for (const side of [-1, 1]) t.body.box(x, 0.048, z + side * 0.04, length + 0.01, 0.009, 0.009, "brass");
  for (let i = 0; i < 4; i += 1) t.body.box(x + (i - 1.5) * length / 5, 0.052, z, 0.035, 0.022, 0.045, color);
};

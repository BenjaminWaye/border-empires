import { archiveHatch, verticalCollar } from "./monument-detail.js";
import type { TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";
import { spinning } from "../client-map-3d-town-overlay/town-parts.js";
import { windowStrip } from "../client-town-district/support-model-core.js";
import type { MonumentKind } from "../client-town-district/district-catalog.js";

// Completed Projects deliberately have different massing. Their commissioned
// components remain identifiable in the final machinery, rather than becoming
// a generic monument with a differently coloured crystal.
const footing = (t: TownBuilders): void => {
  t.body.cylinder(0, 0, 0, 0.28, 0.31, 0.057, "stoneLight", 12);
  t.body.cylinder(0, 0.057, 0, 0.267, 0.28, 0.018, "brassDark", 12);
};
const ribs = (t: TownBuilders, radius: number, base: number, height: number, count: number): void => {
  for (let i = 0; i < count; i++) {
    const a = i * Math.PI * 2 / count, x = Math.sin(a) * radius, z = Math.cos(a) * radius;
    t.body.cylinder(x, base, z, 0.012, 0.018, height, "stoneLight", 6);
    t.body.cylinder(x, base + height, z, 0.019, 0.019, 0.012, "brass", 6);
  }
};
const exchange = (t: TownBuilders): void => {
  footing(t);
  t.body.cylinder(0, 0.075, 0, 0.2, 0.22, 0.19, "stoneDark", 16);
  ribs(t, 0.215, 0.075, 0.205, 12);
  t.body.cylinder(0, 0.278, 0, 0.235, 0.235, 0.022, "brass", 16);
  t.body.dome(0, 0.30, 0, 0.225, "brassDark", 32, 0.7);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    for (let j = 0; j < 6; j++) {
      const p = j * Math.PI / 12, q = (j + 1) * Math.PI / 12;
      t.body.pipe(Math.sin(a) * Math.cos(p) * 0.229, 0.30 + Math.sin(p) * 0.161, Math.cos(a) * Math.cos(p) * 0.229,
        Math.sin(a) * Math.cos(q) * 0.229, 0.30 + Math.sin(q) * 0.161, Math.cos(a) * Math.cos(q) * 0.229, 0.005, "brass");
    }
  }
  // Ledger vaults, a counting engine and the sovereign seal occupy the court.
  for (const x of [-0.245, 0.245]) {
    t.body.box(x, 0.075, 0.045, 0.095, 0.12, 0.19, "stoneDark");
    t.body.box(x, 0.195, 0.045, 0.105, 0.012, 0.2, "brass");
    windowStrip(t, x, 0.11, 0.145, 2);
    archiveHatch(t, x, -0.056, 0.07, 0.09);
  }
  t.body.box(0, 0.075, 0.24, 0.15, 0.095, 0.07, "ironDark");
  t.body.disc(0, 0.205, 0.245, 0.055, 0.02, "brass");
  t.glow.disc(0, 0.205, 0.258, 0.025, 0.005, "lamp");
  t.body.cylinder(0, 0.45, 0, 0.035, 0.055, 0.06, "brass", 8);
  t.glow.gem(0, 0.535, 0, 0.024, 0.05, "lampWarm");
};
const siege = (t: TownBuilders): void => {
  footing(t);
  for (const x of [-0.14, 0.14]) {
    t.body.box(x, 0.075, -0.02, 0.09, 0.17, 0.3, "ironDark");
    t.body.tiltedBox(x, 0.20, 0.0, 0.075, 0.25, 0.08, "brassDark", 0, x < 0 ? -0.3 : 0.3);
    t.body.disc(x, 0.28, 0, 0.047, 0.06, "brass", Math.PI / 2);
    for (const z of [-0.11, -0.02, 0.07]) {
      t.body.box(x, 0.10, z, 0.095, 0.085, 0.045, "stoneDark");
      t.glow.box(x, 0.19, z, 0.06, 0.004, 0.025, "aether");
    }
  }
  // Magnetic barrel with a visible bore, containment collars and parallel rails.
  t.body.pipe(0, 0.32, -0.20, 0, 0.32, 0.19, 0.061, "ironDark");
  for (const z of [-0.18, -0.07, 0.04, 0.15]) {
    t.body.disc(0, 0.32, z, 0.071, 0.018, "brassDark");
    t.body.disc(0, 0.32, z + 0.011, 0.054, 0.004, "ironDark");
  }
  for (const x of [-0.045, 0.045]) t.glow.pipe(x, 0.365, -0.19, x, 0.365, 0.25, 0.006, "aether");
  verticalCollar(t, 0, 0.32, 0.285, 0.061);
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10, x = Math.sin(a) * 0.054, y = 0.32 + Math.cos(a) * 0.054;
    t.body.pipe(x, y, 0.185, x, y, 0.28, 0.009, "ironDark");
  }
  t.glow.gem(0, 0.30, -0.235, 0.06, 0.16, "aether");
  for (const x of [-0.11, 0.11]) {
    t.body.pipe(x, 0.1, -0.18, x * 0.4, 0.43, -0.235, 0.014, "brass");
    for (const z of [-0.045, 0.115]) {
      const y = 0.43 + (z + 0.06) / 0.22 * 0.03;
      t.body.pipe(x, 0.24, z, x, y, z, 0.008, "brassDark");
      t.body.blob(x, y, z, 0.019, "brassDark");
    }
    t.body.pipe(x, 0.43, -0.06, x, 0.46, 0.16, 0.017, "iron");
    t.glow.disc(x, 0.46, 0.17, 0.014, 0.004, "lamp");
  }
};
const aegis = (t: TownBuilders): void => {
  footing(t);
  t.body.dome(0, 0.095, 0, 0.235, "glass", 32, 1.0);
  t.glow.ring(0, 0.10, 0, 0.238, "aether", 0.015);
  t.body.cylinder(0, 0.075, 0, 0.075, 0.11, 0.06, "iron", 12);
  t.glow.gem(0, 0.19, 0, 0.042, 0.11, "aether");
  ribs(t, 0.09, 0.10, 0.08, 6);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, x = Math.sin(a) * 0.25, z = Math.cos(a) * 0.25;
    t.body.cylinder(x, 0.07, z, 0.02, 0.04, 0.18, "iron", 6);
    t.glow.gem(x, 0.265, z, 0.021, 0.055, "aether");
    // Meridional shield-lattice ribs follow the actual dome surface.
    for (let j = 0; j < 5; j++) {
      const p = j * Math.PI / 10, q = (j + 1) * Math.PI / 10;
      t.body.pipe(Math.sin(a) * Math.cos(p) * 0.238, 0.095 + Math.sin(p) * 0.238, Math.cos(a) * Math.cos(p) * 0.238,
        Math.sin(a) * Math.cos(q) * 0.238, 0.095 + Math.sin(q) * 0.238, Math.cos(a) * Math.cos(q) * 0.238, 0.006, "brass");
    }
  }
  t.body.ring(0, 0.34, 0, 0.065, "brass", 0.1);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    t.body.pipe(Math.sin(a) * 0.065, 0.34, Math.cos(a) * 0.065, Math.sin(a) * 0.035, 0.40, Math.cos(a) * 0.035, 0.01, "brass");
  }
  t.glow.gem(0, 0.385, 0, 0.025, 0.075, "aether");
};
const astral = (t: TownBuilders): void => {
  footing(t);
  t.body.cylinder(0, 0.08, 0, 0.17, 0.20, 0.06, "ironDark", 16);
  t.glow.ring(0, 0.145, 0, 0.16, "aether", 0.025);
  // Open launch cradle: four independent curved launch arms frame the payload.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    for (const [radius, y] of [[0.25, 0.28], [0.19, 0.47]] as const) t.body.blob(Math.sin(a) * radius, y, Math.cos(a) * radius, 0.022, "brassDark");
    const points = [[0.27, 0.07], [0.25, 0.28], [0.19, 0.47], [0.13, 0.54]] as const;
    for (let j = 0; j < points.length - 1; j++) {
      const p = points[j]!, q = points[j + 1]!;
      t.body.pipe(Math.sin(a) * p[0], p[1], Math.cos(a) * p[0], Math.sin(a) * q[0], q[1], Math.cos(a) * q[0], 0.017, "iron");
      t.glow.pipe(Math.sin(a) * (p[0] - 0.017), p[1], Math.cos(a) * (p[0] - 0.017), Math.sin(a) * (q[0] - 0.017), q[1], Math.cos(a) * (q[0] - 0.017), 0.005, "aether");
    }
  }
  // Satellite: crystalline sail panels around a suspended flight bus.
  spinning(t, 0, 0.39, 0, [0, 1, 0], 0.12, () => {
    t.body.cylinder(0, 0.26, 0, 0.028, 0.045, 0.24, "brass", 8);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, x = Math.sin(a) * 0.085, z = Math.cos(a) * 0.085;
      t.body.box(x, 0.31, z, 0.075, 0.17, 0.012, "glassLight", a);
      t.body.box(x, 0.48, z, 0.08, 0.006, 0.016, "brass", a);
      t.glow.box(x, 0.39, z, 0.071, 0.005, 0.015, "aether", a);
      for (const side of [-1, 1]) {
        const px = x + side * Math.cos(a) * 0.037, pz = z - side * Math.sin(a) * 0.037;
        t.body.pipe(px, 0.31, pz, px, 0.48, pz, 0.004, "brass");
      }
    }
    t.glow.gem(0, 0.52, 0, 0.032, 0.08, "aether");
  });
  t.body.pipe(-0.24, 0.08, 0.12, -0.24, 0.24, 0.12, 0.014, "brass");
  t.body.disc(-0.24, 0.27, 0.12, 0.054, 0.014, "iron", -0.4);
  t.glow.disc(-0.24, 0.27, 0.131, 0.027, 0.005, "aether", -0.4);
};
const census = (t: TownBuilders): void => {
  footing(t);
  // One continuous crescent archive, integrated with the index tower.
  // Low galleries keep the tower dominant instead of flanking it with boxes.
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * 0.6 + i * Math.PI * 0.15;
    const x = Math.sin(a) * 0.185, z = -0.045 - Math.cos(a) * 0.185;
    t.body.box(x, 0.075, z, 0.098, 0.125, 0.075, "stoneDark", -a);
    t.body.box(x, 0.20, z, 0.103, 0.012, 0.084, "brassDark", -a);
    t.body.pipe(x, 0.085, z, x, 0.22, z, 0.009, "brass");
    t.glow.box(x + Math.sin(a) * 0.039, 0.15, z - Math.cos(a) * 0.039,
      0.046, 0.009, 0.003, "lampWarm", -a);
  }
  // Tall rotary citizen index, with visible separate tabulating drums.
  t.body.cylinder(0, 0.075, -0.045, 0.085, 0.11, 0.55, "ironDark", 12);
  for (let i = 0; i < 7; i++) {
    const y = 0.14 + i * 0.075;
    t.body.cylinder(0, y, -0.045, 0.105, 0.105, 0.028, "brassDark", 12);
    for (let j = 0; j < 6; j++) {
      const a = j * Math.PI / 3;
      t.glow.box(Math.sin(a) * 0.106, y + 0.006, -0.045 + Math.cos(a) * 0.106, 0.022, 0.013, 0.008, "aether", a);
    }
  }
  t.body.cylinder(0, 0.63, -0.045, 0.13, 0.13, 0.018, "brass", 24);
  t.body.cylinder(0, 0.648, -0.045, 0.085, 0.12, 0.035, "iron", 24);
  for (const x of [-0.12, 0.12]) {
    t.body.pipe(x, 0.08, -0.045, x, 0.67, -0.045, 0.015, "stoneLight");
  }
  // Recessed entrance and broad stair replace the detached screen kiosk.
  t.body.box(0, 0.075, 0.071, 0.082, 0.13, 0.018, "ironDark");
  for (const x of [-0.048, 0.048]) t.body.pipe(x, 0.075, 0.087, x, 0.21, 0.087, 0.008, "brass");
  t.body.pipe(-0.048, 0.21, 0.087, 0.048, 0.21, 0.087, 0.008, "brass");
  for (let i = 0; i < 3; i++) {
    t.body.box(0, 0.075 + i * 0.014, 0.21 - i * 0.033, 0.16 - i * 0.015, 0.014, 0.11 - i * 0.027, "stoneLight");
  }

};
const levy = (t: TownBuilders): void => {
  footing(t);
  // Armoured assembly hall feeds the open deployment court through a gate.
  t.body.box(0, 0.075, -0.15, 0.36, 0.19, 0.15, "ironDark");
  t.body.gable(0, 0.265, -0.15, 0.40, 0.085, 0.19, "iron");
  for (const x of [-0.16, -0.08, 0, 0.08, 0.16]) {
    t.body.pipe(x, 0.09, -0.245, x, 0.27, -0.245, 0.009, "brassDark");
    t.body.pipe(x, 0.27, -0.245, x, 0.35, -0.15, 0.009, "brass");
    t.body.pipe(x, 0.35, -0.15, x, 0.27, -0.055, 0.009, "brass");
  }
  for (const x of [-0.105, 0, 0.105]) {
    t.body.box(x, 0.078, -0.068, 0.077, 0.15, 0.008, "window");
    t.glow.box(x, 0.225, -0.061, 0.07, 0.008, 0.005, "lampWarm");
  }
  // Muster gate and broad Titanium Standard make a horizontal silhouette,
  // distinct from the Directorate's slender vertical index tower.
  for (const x of [-0.21, 0.21]) {
    t.body.box(x, 0.075, -0.035, 0.075, 0.35, 0.13, "ironDark");
    t.body.box(x, 0.1, 0.035, 0.085, 0.25, 0.015, "stoneLight");
    t.body.pipe(x, 0.09, -0.12, x, 0.39, -0.035, 0.02, "brassDark");
  }
  t.body.box(0, 0.42, -0.035, 0.51, 0.055, 0.16, "iron");
  t.body.box(0, 0.485, -0.035, 0.28, 0.14, 0.018, "ironDark");
  t.body.box(0, 0.49, -0.02, 0.25, 0.025, 0.008, "brass");
  t.body.box(0, 0.615, -0.02, 0.30, 0.012, 0.025, "brassDark");
  for (const x of [-0.12, 0.12]) t.body.box(x, 0.495, -0.02, 0.012, 0.11, 0.022, "brassDark");
  t.body.disc(0, 0.555, -0.018, 0.04, 0.012, "brass");
  t.glow.disc(0, 0.555, -0.009, 0.016, 0.004, "beacon");
  // Three klaxon mouths face the deployment court; the writ sits below.
  for (const x of [-0.135, 0, 0.135]) {
    t.body.pipe(x, 0.44, 0.02, x, 0.46, 0.15, 0.026, "brassDark");
    t.body.disc(x, 0.46, 0.16, 0.037, 0.02, "brass");
    t.body.disc(x, 0.46, 0.172, 0.026, 0.004, "ironDark");
  }
  for (const x of [-0.12, 0, 0.12]) {
    t.body.box(x, 0.075, 0.17, 0.075, 0.025, 0.19, "iron");
    t.glow.box(x, 0.102, 0.17, 0.012, 0.003, 0.17, "lampWarm");
  }
  t.body.box(0.245, 0.075, 0.19, 0.065, 0.08, 0.07, "brassDark");
  t.body.box(0.245, 0.14, 0.19, 0.065, 0.055, 0.07, "ironDark");
  t.glow.panel(0.245, 0.16, 0.228, 0.04, 0.04, "beacon");
};
export const buildMonument = (t: TownBuilders, kind: MonumentKind): void => {
  switch (kind) {
    case "IMPERIAL_EXCHANGE": return exchange(t);
    case "SOVEREIGN_SIEGE_ENGINE": return siege(t);
    case "AEGIS_DOME": return aegis(t);
    case "ASTRAL_DOCK": return astral(t);
    case "CENSUS_DIRECTORATE": return census(t);
    case "TITANIUM_LEVY": return levy(t);
  }
};

// History snapshot: packages/client/src/client-map-3d-town-overlay/town-parts.ts at commit 750ba4bc (2026-10-12).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// The technology rising out of the towns -- sandstone towers banded in brass,
// glass domes, arcologies, skybridges, a monorail ring, aether pylons -- built from
// the town-mesh-builder primitives. Each takes the solid `body` builder
// (iron/brass route to the metal mesh by colour) and the unlit `glow`
// builder (window bands, lamps, aether).
import type { TownColor, TownMeshBuilder } from "./town-mesh-builder.js";

export type TownBuilders = {
  readonly body: TownMeshBuilder;
  readonly glow: TownMeshBuilder;
  /** Deterministic 0..1 roll, seeded per tier. */
  readonly random: () => number;
};

/** Rotates the local offset (lx, lz) by ry and adds it to (x, z). */
export const at = (x: number, z: number, ry: number, lx: number, lz: number): readonly [number, number] => {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  return [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
};

/** Point `radius` out from the centre at `degrees` (0 = east, 90 = south, towards the camera). */
export const polar = (radius: number, degrees: number): readonly [number, number] => {
  const angle = (degrees * Math.PI) / 180;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
};

/** The ry that turns a piece's +z face outward at `degrees`. */
export const facingOut = (degrees: number): number => Math.PI / 2 - (degrees * Math.PI) / 180;

export type TowerCap = "dome" | "glassDome" | "pad" | "garden" | "spire" | "antenna";

export type TierTowerOptions = {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly tiers: number;
  readonly tierH: number;
  readonly cap: TowerCap;
  /** Window-band light: warm "lamp" for homes, "aether" for civic towers. */
  readonly light: TownColor;
  readonly shell?: TownColor;
  /** Radius lost per tier, as a share of the base radius. */
  readonly taper?: number;
  readonly spireH?: number;
  readonly y?: number;
};

/** Stacked sandstone tiers, each with a lit window band and a cornice, on an
 * iron footing -- the AFC's printer tower built in stone. Returns the cap's top. */
export const tierTower = (t: TownBuilders, o: TierTowerOptions): number => {
  const segments = 10;
  const shell = o.shell ?? "sandstone";
  let y = o.y ?? 0;
  let radius = o.radius;
  t.body.cylinder(o.x, y, o.z, radius * 1.12, radius * 1.16, 0.016, "ironDark", segments);
  y += 0.016;
  for (let i = 0; i < o.tiers; i += 1) {
    radius = o.radius * (1 - (o.taper ?? 0) * i);
    t.body.cylinder(o.x, y, o.z, radius, radius, o.tierH * 0.86, shell, segments);
    t.glow.cylinder(o.x, y + o.tierH * 0.32, o.z, radius * 1.012, radius * 1.012, o.tierH * 0.2, o.light, segments);
    t.body.cylinder(o.x, y + o.tierH * 0.86, o.z, radius * 1.07, radius * 1.07, o.tierH * 0.14, "sandstoneDark", segments);
    if (i === 0) t.body.ring(o.x, y + o.tierH * 0.93, o.z, radius * 1.08, "brass", 0.08);
    y += o.tierH;
  }
  switch (o.cap) {
    case "dome":
      t.body.dome(o.x, y, o.z, radius * 0.95, "copper", 12, 0.85);
      t.body.gem(o.x, y + radius * 0.82, o.z, radius * 0.14, radius * 0.3, "brass");
      return y + radius * 0.95;
    case "glassDome":
      t.body.dome(o.x, y, o.z, radius * 0.95, "glass", 12, 0.85);
      t.body.ring(o.x, y + radius * 0.3, o.z, radius * 0.86, "brass", 0.08);
      return y + radius * 0.82;
    case "pad":
      t.body.cylinder(o.x, y, o.z, radius * 1.35, radius * 1.2, 0.01, "iron", 12);
      t.glow.ring(o.x, y + 0.011, o.z, radius * 1.1, "aether", 0.05);
      return y + 0.016;
    case "garden":
      t.body.cylinder(o.x, y, o.z, radius * 0.95, radius * 0.95, 0.008, "garden", 12);
      t.body.blob(o.x - radius * 0.3, y + radius * 0.35, o.z, radius * 0.38, "foliage");
      t.body.blob(o.x + radius * 0.35, y + radius * 0.3, o.z + radius * 0.2, radius * 0.3, "foliageLight");
      return y + radius * 0.7;
    case "spire": {
      const spireH = o.spireH ?? radius * 3;
      t.body.cone(o.x, y, o.z, radius * 0.6, spireH, "copper", 10);
      t.body.ring(o.x, y + spireH * 0.25, o.z, radius * 0.45, "brass", 0.1);
      t.glow.gem(o.x, y + spireH + 0.03, o.z, radius * 0.3, 0.05, "aether");
      return y + spireH + 0.06;
    }
    case "antenna":
      t.body.pipe(o.x, y, o.z, o.x, y + 0.09, o.z, 0.004, "iron");
      t.body.ring(o.x, y + 0.05, o.z, 0.012, "brass");
      t.glow.gem(o.x, y + 0.1, o.z, 0.008, 0.014, "aether");
      return y + 0.11;
  }
};

/** Hydroponic glasshouse dome with a brass hoop, gardens round its foot. */
export const hydroDome = (t: TownBuilders, x: number, z: number, radius: number): void => {
  t.body.cylinder(x, 0, z, radius * 1.1, radius * 1.14, 0.012, "ironDark", 12);
  t.body.cylinder(x, 0.012, z, radius * 1.06, radius * 1.06, 0.004, "garden", 12);
  t.body.dome(x, 0.012, z, radius, "glass", 12, 0.9);
  t.body.ring(x, 0.012 + radius * 0.45, z, radius * 0.9, "brass", 0.06);
  t.body.ring(x, 0.016, z, radius * 1.01, "brass", 0.06);
};

/** Stepped arcology: terraced brick and sandstone drums with gardens on every terrace and
 * a glass crown. Returns its top. */
export const arcology = (t: TownBuilders, x: number, z: number, radius: number, steps: number, stepH: number): number => {
  let y = 0;
  for (let i = 0; i < steps; i += 1) {
    const r = radius * (1 - i * (0.7 / steps));
    t.body.cylinder(x, y, z, r, r * 1.03, stepH * 0.85, i === 0 ? "brick" : "sandstone", 14);
    t.glow.cylinder(x, y + stepH * 0.35, z, r * 1.01, r * 1.01, stepH * 0.16, "lamp", 14);
    t.body.cylinder(x, y + stepH * 0.85, z, r * 1.02, r * 1.02, stepH * 0.15, "sandstoneDark", 14);
    t.body.cylinder(x, y + stepH, z, r * 0.98, r * 0.98, 0.004, "garden", 14);
    y += stepH;
  }
  const crown = radius * 0.3;
  t.body.dome(x, y, z, crown, "glass", 12, 0.9);
  t.body.ring(x, y + 0.004, z, crown * 1.02, "brass", 0.08);
  return y + crown * 0.9;
};

/** Enclosed skybridge tube with an aether light strip along its roof. */
export const skyBridge = (
  t: TownBuilders, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number
): void => {
  t.body.pipe(x0, y0, z0, x1, y1, z1, 0.009, "sandstone");
  t.glow.pipe(x0, y0 + 0.009, z0, x1, y1 + 0.009, z1, 0.003, "aether");
};

/** Elevated monorail ring of `sides` straight spans on iron pylons, with one train. */
export const monorailRing = (t: TownBuilders, radius: number, h: number, sides: number): void => {
  const point = (i: number): readonly [number, number] => polar(radius, (i * 360) / sides);
  for (let i = 0; i < sides; i += 1) {
    const [x0, z0] = point(i);
    const [x1, z1] = point(i + 1);
    const length = Math.hypot(x1 - x0, z1 - z0);
    const ry = -Math.atan2(z1 - z0, x1 - x0);
    t.body.box((x0 + x1) / 2, h, (z0 + z1) / 2, length + 0.01, 0.014, 0.022, "iron", ry);
    t.glow.box((x0 + x1) / 2, h + 0.014, (z0 + z1) / 2, length, 0.003, 0.007, "aether", ry);
    t.body.cylinder(x0, 0, z0, 0.008, 0.012, h, "ironDark", 6);
    t.body.cylinder(x0, h - 0.014, z0, 0.013, 0.013, 0.007, "brass", 6);
  }
  // One train, on the span facing the camera.
  const span = Math.round(sides / 4);
  const [ax, az] = point(span);
  const [bx, bz] = point(span + 1);
  const ry = -Math.atan2(bz - az, bx - ax);
  t.body.ellipsoid((ax + bx) / 2, h + 0.03, (az + bz) / 2, 0.055, 0.015, 0.016, "copper", ry);
  t.glow.ellipsoid((ax + bx) / 2, h + 0.032, (az + bz) / 2, 0.045, 0.005, 0.0165, "lamp", ry);
};

/** Aether pylon: tapered iron mast, brass hoops, a floating crystal on top. */
export const aetherPylon = (t: TownBuilders, x: number, z: number, h: number): number => {
  t.body.cylinder(x, 0, z, 0.016, 0.024, 0.016, "ironDark", 8);
  t.body.cylinder(x, 0.016, z, 0.006, 0.012, h - 0.016, "iron", 8);
  for (const f of [0.45, 0.8]) t.body.ring(x, h * f, z, 0.014, "brass", 0.16);
  t.body.cylinder(x, h, z, 0.016, 0.006, 0.012, "brass", 8);
  t.glow.gem(x, h + 0.028, z, 0.012, 0.022, "aether");
  return h + 0.05;
};

/** Iron wind turbine with timber blades, facing the camera. */
export const windTurbine = (t: TownBuilders, x: number, z: number, h: number): void => {
  t.body.cylinder(x, 0, z, 0.004, 0.008, h, "iron", 6);
  t.body.ellipsoid(x, h, z, 0.012, 0.009, 0.018, "copper");
  t.body.disc(x, h, z + 0.018, 0.006, 0.006, "brass");
  const blade = h * 0.36;
  for (let i = 0; i < 3; i += 1) {
    const angle = (i * 2 * Math.PI) / 3 + 0.3;
    t.body.tiltedBox(x - Math.sin(angle) * blade * 0.5, h + Math.cos(angle) * blade * 0.5, z + 0.022, 0.009, blade, 0.002, "timber", 0, angle);
  }
};

export type TreeKind = "leaf" | "pine";

export const tree = (t: TownBuilders, x: number, z: number, size: number, kind: TreeKind, y = 0): void => {
  t.body.cylinder(x, y, z, size * 0.12, size * 0.16, size * 0.45, "trunk", 5);
  if (kind === "pine") {
    t.body.cone(x, y + size * 0.3, z, size * 0.5, size * 0.6, "foliageDark", 6);
    t.body.cone(x, y + size * 0.62, z, size * 0.36, size * 0.5, "foliageDark", 6);
    return;
  }
  t.body.blob(x, y + size * 0.62, z, size * 0.42, t.random() < 0.5 ? "foliage" : "foliageLight");
};

/** Street lamp: slim iron post with an aether lantern. */
export const lampPost = (t: TownBuilders, x: number, z: number, h = 0.05, light: TownColor = "aether"): void => {
  t.body.cylinder(x, 0, z, 0.0035, 0.0045, h, "iron", 5);
  t.glow.gem(x, h + 0.006, z, 0.007, 0.01, light);
};

/** Round plaza deck the town stands on, its top at y = 0: an iron-rimmed,
 * brass-banded disc that runs well below 0 so a sloped tile never shows a
 * gap under it (the overlay lifts the whole town; see TOWN_BASE_LIFT). */
export const plazaDeck = (t: TownBuilders, radius: number, top: TownColor = "plaza"): void => {
  // Rim stops short of y = 0 so it never fights the plaza disc for depth.
  t.body.cylinder(0, -0.1, 0, radius, radius * 1.02, 0.092, "ironDark", 24);
  t.body.cylinder(0, -0.016, 0, radius * 1.012, radius * 1.012, 0.008, "brass", 24);
  t.body.cylinder(0, -0.008, 0, radius * 0.985, radius * 0.985, 0.008, top, 24);
  // Inlaid promenade ring.
  t.body.ring(0, 0, 0, radius * 0.62, "plazaDark", 0.012);
};

// Shared town pieces -- the octagonal base plate, brass cogs, skybridges,
// airships, trees and street lamps -- built from the town-mesh-builder
// primitives. Each takes the solid `body` builder (iron/brass route to the
// metal mesh by colour) and the unlit `glow` builder (lamplight, aether).
import type { TownColor, TownMeshBuilder } from "./town-mesh-builder.js";

export type TownBuilders = {
  readonly body: TownMeshBuilder;
  readonly glow: TownMeshBuilder;
  /** Animated steam puffs (see applyTownSteam). */
  readonly steam: TownMeshBuilder;
  /** Deterministic 0..1 roll, seeded per tier. */
  readonly random: () => number;
};

/** Draws `draw` (body and glow alike) spinning at `speed` rad/s about `axis`
 * through the pivot (x, y, z). */
export const spinning = (
  t: TownBuilders, x: number, y: number, z: number,
  axis: readonly [number, number, number], speed: number, draw: () => void
): void => {
  const anim = { a: [x, y, z, speed], b: [axis[0], axis[1], axis[2], 0] } as const;
  t.body.withAnim(anim, () => t.glow.withAnim(anim, draw));
};

const Y_AXIS = [0, 1, 0] as const;

/** Smokestack on a roof at (x, y, z), with steam puffs looping out of it. */
export const steamVent = (t: TownBuilders, x: number, y: number, z: number, h = 0.035): void => {
  t.body.cylinder(x, y, z, 0.007, 0.009, h, "iron", 8);
  t.body.cylinder(x, y + h - 0.006, z, 0.0095, 0.0095, 0.006, "brass", 8);
  const phase = t.random();
  const rate = 0.11 + t.random() * 0.05;
  for (let i = 0; i < 4; i += 1) {
    const anim = { a: [x, y + h + 0.01, z, rate], b: [0.05, 0.015, 0.2, (phase + i / 4) % 1] } as const;
    t.steam.withAnim(anim, () => t.steam.blob(x, y + h + 0.01, z, 0.017, "steam", 1));
  }
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

/** Octagonal base plate, its top at y = 0: grey stone inside a brass band on
 * an iron skirt that runs well below 0, so a sloped tile never shows a gap
 * under it (the overlay lifts the whole town; see TOWN_BASE_LIFT). */
export const octagonPlate = (t: TownBuilders, radius: number, plazaRing = true): void => {
  const turn = Math.PI / 8;
  t.body.cylinder(0, -0.1, 0, radius, radius * 1.02, 0.092, "ironDark", 8, turn);
  t.body.cylinder(0, -0.016, 0, radius * 1.012, radius * 1.012, 0.008, "brass", 8, turn);
  t.body.cylinder(0, -0.008, 0, radius * 0.985, radius * 0.985, 0.008, "plate", 8, turn);
  // Inlaid brass ring round the central plaza.
  if (plazaRing) t.body.ring(0, 0, 0, radius * 0.42, "brassDark", 0.03);
};

/** Paved avenue inlaid in the plate from (x0, z0) to (x1, z1), brass-kerbed. */
export const avenue = (t: TownBuilders, x0: number, z0: number, x1: number, z1: number, width: number): void => {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const ry = -Math.atan2(z1 - z0, x1 - x0);
  t.body.box((x0 + x1) / 2, 0, (z0 + z1) / 2, length, 0.002, width, "plateDark", ry);
  for (const side of [-1, 1] as const) {
    const [kx, kz] = at((x0 + x1) / 2, (z0 + z1) / 2, ry, 0, side * width / 2);
    t.body.box(kx, 0, kz, length, 0.003, 0.004, "brassDark", ry);
  }
};

/** Brass cog facing +z (turned ry), centred on (x, y, z), turning slowly. */
export const gear = (t: TownBuilders, x: number, y: number, z: number, radius: number, ry: number, speed = 0.5): void => {
  spinning(t, x, y, z, [Math.sin(ry), 0, Math.cos(ry)], speed, () => {
    t.body.disc(x, y, z, radius * 0.8, 0.006, "brass", ry);
    for (let i = 0; i < 4; i += 1) t.body.tiltedBox(x, y, z, radius * 2, radius * 0.3, 0.005, "brass", ry, (i * Math.PI) / 4);
  });
  t.body.disc(x, y, z, radius * 0.26, 0.012, "brassDark", ry);
};

/** Enclosed skybridge with a lamplit strip along its roof. */
export const skyBridge = (
  t: TownBuilders, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number
): void => {
  t.body.pipe(x0, y0, z0, x1, y1, z1, 0.008, "stoneDark");
  t.glow.pipe(x0, y0 + 0.008, z0, x1, y1 + 0.008, z1, 0.0028, "lamp");
};

/** Airship slowly circling the town centre, nose along its path. */
export const circlingAirship = (t: TownBuilders, x: number, y: number, z: number, length: number, speed: number): void => {
  spinning(t, 0, y, 0, Y_AXIS, speed, () => airship(t, x, y, z, length, Math.atan2(x, z) + (speed < 0 ? Math.PI : 0)));
};

/** Grey-hulled, brass-hooped airship, long axis along x (turned ry). */
export const airship = (t: TownBuilders, x: number, y: number, z: number, length: number, ry: number): void => {
  const radius = length * 0.19;
  t.body.ellipsoid(x, y, z, length / 2, radius, radius, "stoneLight", ry);
  for (const lx of [-length * 0.24, length * 0.18]) {
    const [bx, bz] = at(x, z, ry, lx, 0);
    t.body.ellipsoid(bx, y, bz, length * 0.022, radius * 1.03, radius * 1.03, "brass", ry);
  }
  const [fx, fz] = at(x, z, ry, -length * 0.42, 0);
  t.body.tiltedBox(fx, y, fz, length * 0.16, radius * 2.3, 0.006, "brassDark", ry, 0);
  t.body.tiltedBox(fx, y, fz, length * 0.16, 0.006, radius * 2.3, "brassDark", ry, 0);
  const gondolaY = y - radius - 0.024;
  t.body.ellipsoid(x, gondolaY + 0.01, z, length * 0.17, 0.014, 0.017, "graphite", ry);
  for (const side of [1, -1] as const) {
    const [wx, wz] = at(x, z, ry, 0, side * 0.0172);
    t.glow.panel(wx, gondolaY + 0.011, wz, length * 0.2, 0.006, "lamp", side === 1 ? ry : ry + Math.PI);
  }
};

export const tree = (t: TownBuilders, x: number, z: number, size: number): void => {
  t.body.cylinder(x, 0, z, size * 0.12, size * 0.16, size * 0.45, "trunk", 5);
  t.body.blob(x, size * 0.62, z, size * 0.42, t.random() < 0.5 ? "foliage" : "foliageLight");
};

/** Street lamp: slim iron post with a lamplit lantern. */
export const lampPost = (t: TownBuilders, x: number, z: number, h = 0.05, light: TownColor = "lamp"): void => {
  t.body.cylinder(x, 0, z, 0.0035, 0.0045, h, "iron", 5);
  t.body.cylinder(x, h - 0.002, z, 0.008, 0.005, 0.006, "brass", 6);
  t.glow.gem(x, h + 0.008, z, 0.007, 0.011, light);
};

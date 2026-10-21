// Shared town pieces -- the octagonal base plate, brass cogs, skybridges,
// airships, trees, street lamps and warning beacons -- built from the
// town-mesh-builder primitives. Each takes the solid `body` builder
// (iron/brass and glass route to their own meshes by colour), the unlit
// `glow` builder (lamplight, aether) and the additive `halo` builder (the
// pools of light they throw on the paving).
import { loopRate, loopSpeed, TOWN_BEACON_PHASE } from "./town-animation-shaders.js";
import type { TownColor, TownMeshBuilder } from "./town-mesh-builder.js";

export type TownBuilders = {
  readonly body: TownMeshBuilder;
  readonly glow: TownMeshBuilder;
  /** Additive light pools on the ground, breathing with the lamps. */
  readonly halo: TownMeshBuilder;
  /** Animated steam puffs (see applyTownSteam). */
  readonly steam: TownMeshBuilder;
  /** Banner cloth, rippling (see applyTownBanner) in the owner's colour. */
  readonly banner: TownMeshBuilder;
  /** Deterministic 0..1 roll, seeded per tier. */
  readonly random: () => number;
};

/** Draws `draw` (body and glow alike) spinning at `speed` rad/s about `axis`
 * through the pivot (x, y, z). */
export const spinning = (
  t: TownBuilders, x: number, y: number, z: number,
  axis: readonly [number, number, number], speed: number, draw: () => void
): void => {
  const anim = { a: [x, y, z, loopSpeed(speed)], b: [axis[0], axis[1], axis[2], 0] } as const;
  t.body.withAnim(anim, () => t.glow.withAnim(anim, draw));
};

/** Draws `draw` (glow and halo alike) flickering in step at `phase`, so a light and its pool breathe together. */
export const inStep = (t: TownBuilders, phase: number, draw: () => void): void => {
  const anim = { a: [0, 0, 0, 0], b: [0, 0, 0, phase] } as const;
  t.glow.withAnim(anim, () => t.halo.withAnim(anim, draw));
};

/** Red aircraft-warning light at (x, y, z), blinking (see TOWN_BEACON_PHASE). */
export const beacon = (t: TownBuilders, x: number, y: number, z: number, size = 0.006): void => {
  inStep(t, TOWN_BEACON_PHASE + t.random(), () => t.glow.gem(x, y, z, size, size * 1.4, "beacon"));
};

const Y_AXIS = [0, 1, 0] as const;

/** Light pools sit just over the raised sidewalks (0.005), clear of z-fighting. */
export const TOWN_HALO_Y = 0.0068;

/** Smokestack on a roof at (x, y, z), with steam puffs looping out of it. */
export const steamVent = (t: TownBuilders, x: number, y: number, z: number, h = 0.035): void => {
  t.body.cylinder(x, y, z, 0.007, 0.009, h, "iron", 8);
  t.body.cylinder(x, y + h - 0.006, z, 0.0095, 0.0095, 0.006, "brass", 8);
  const phase = t.random();
  const rate = loopRate(0.11 + t.random() * 0.05);
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

/** Distance from the centre to each flat edge of an octagonPlate of `radius`
 * (its edges face the x and z axes and the diagonals). */
export const octagonApothem = (radius: number): number => radius * 0.985 * Math.cos(Math.PI / 8);

/** Whether the point (x, z) lies within `apothem` of every edge of the octagon. */
export const insideOctagon = (x: number, z: number, apothem: number): boolean => {
  for (let k = 0; k < 4; k += 1) {
    const angle = (k * Math.PI) / 4;
    if (Math.abs(x * Math.cos(angle) + z * Math.sin(angle)) > apothem) return false;
  }
  return true;
};

/** How much wider a plate's skirt is at its foot (y = -0.1) than at its top.
 * Kept small enough that the largest plate's foot stays inside its tile. */
export const PLATE_SKIRT_FLARE = 1.12;

/** Radius of a plateSkirt of `radius` (top at `topY`) at height `y`. */
const skirtRadiusAt = (radius: number, topY: number, y: number): number =>
  radius * (1 + ((PLATE_SKIRT_FLARE - 1) * (topY - y)) / (topY + 0.1));

/** Matte stone foundation under an octagonal plate, from y = -0.1 up to
 * `topY`, widening towards the ground so its sides tilt up into the light.
 * It runs well below 0 so a sloped tile never shows a gap under the plate (the
 * overlays lift the plate only by TOWN_BASE_LIFT), which means a lot of it
 * shows on a tile whose corners sit lower; a dark metal skirt read as a black
 * band there. */
export const plateSkirt = (body: TownMeshBuilder, radius: number, topY: number): void => {
  body.cylinder(0, -0.1, 0, radius, radius * PLATE_SKIRT_FLARE, topY + 0.1, "stoneDark", 8, Math.PI / 8);
};

/** Octagonal base plate, its top at y = 0: streets (or `top`) inside a low
 * kerb and a brass band, on a flared coursed masonry wall (plateSkirt). */
export const octagonPlate = (t: TownBuilders, radius: number, plazaRing = true, top: TownColor = "asphalt"): void => {
  const turn = Math.PI / 8;
  plateSkirt(t.body, radius, -0.008);
  // The brass band keeps its lip over the flared wall below it.
  const band = skirtRadiusAt(radius, -0.008, -0.016) + radius * 0.01;
  t.body.cylinder(0, -0.016, 0, band, band, 0.008, "brass", 8, turn);
  t.body.cylinder(0, -0.008, 0, radius * 0.985, radius * 0.985, 0.008, top, 8, turn);
  // A darker plinth course just under the band, following the skirt's flare.
  const course = (y: number): number => skirtRadiusAt(radius, -0.008, y) + radius * 0.006;
  t.body.cylinder(0, -0.03, 0, course(-0.02), course(-0.03), 0.01, "graphite", 8, turn);
  // Low kerb round the edge of the paving.
  const apothem = octagonApothem(radius);
  const edge = 2 * apothem * Math.tan(Math.PI / 8) - 0.006;
  for (let k = 0; k < 8; k += 1) {
    const degrees = k * 45;
    const [x, z] = polar(apothem - 0.005, degrees);
    t.body.box(x, 0, z, edge, 0.006, 0.008, "stoneLight", facingOut(degrees));
  }
  if (plazaRing) {
    // A raised flagstone plaza inside an inlaid brass ring, a paler rosette at its heart.
    t.body.cylinder(0, 0, 0, radius * 0.42, radius * 0.42, 0.003, "paving", 16);
    t.body.cylinder(0, 0.003, 0, radius * 0.2, radius * 0.2, 0.003, "stoneLight", 8, Math.PI / 8);
    t.body.ring(0, 0.003, 0, radius * 0.42, "brassDark", 0.03);
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

/** Tree with a two-lobed crown: a dark lower mass under a sunlit top. */
export const tree = (t: TownBuilders, x: number, z: number, size: number): void => {
  const light = t.random() < 0.5;
  t.body.cylinder(x, 0, z, size * 0.12, size * 0.16, size * 0.45, "trunk", 5);
  t.body.blob(x, size * 0.58, z, size * 0.42, light ? "foliage" : "foliageLight");
  t.body.blob(x + size * 0.08, size * 0.84, z - size * 0.06, size * 0.27, light ? "foliageLight" : "foliage");
};

/** Street lamp: slim iron post with a lamplit lantern throwing a pool of light round its foot. */
export const lampPost = (t: TownBuilders, x: number, z: number, h = 0.05, light: TownColor = "lamp"): void => {
  t.body.cylinder(x, 0, z, 0.0035, 0.0045, h, "iron", 5);
  t.body.cylinder(x, h - 0.002, z, 0.008, 0.005, 0.006, "brass", 6);
  inStep(t, t.random(), () => {
    t.glow.gem(x, h + 0.008, z, 0.007, 0.011, light);
    t.halo.pool(x, TOWN_HALO_Y, z, h * 0.95, light);
  });
};

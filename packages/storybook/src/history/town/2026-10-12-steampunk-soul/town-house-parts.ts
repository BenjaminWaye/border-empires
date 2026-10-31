// History snapshot: packages/client/src/client-map-3d-town-overlay/town-house-parts.ts at commit 750ba4bc (2026-10-12).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// The lived-in streets: townhouses with lit windows and brass-banded eaves,
// crescents of them round a plaza, a geared clock tower, fountains and
// market stalls. Built from the town-mesh-builder primitives.
import type { TownColor } from "./town-mesh-builder.js";
import { at, facingOut, polar, type TownBuilders } from "./town-parts.js";

// Clearance off a wall so a window/door quad never z-fights the wall face.
const FACE_GAP = 0.0025;
const STOREY_HEIGHT = 0.068;

export const pick = <T>(random: () => number, options: readonly T[]): T =>
  options[Math.min(options.length - 1, Math.floor(random() * options.length))]!;

export type HouseOptions = {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly storeys?: number;
  readonly wall: TownColor;
  readonly roof: TownColor;
  readonly ry?: number;
  readonly roofPitch?: number;
  readonly chimney?: boolean;
  /** Share of windows drawn lit, 0..1. */
  readonly lit?: number;
  /** Steep four-sided mansard instead of a gable. */
  readonly mansard?: boolean;
};

/** Townhouse: walls, brass eave band, gable or mansard roof, windows on both
 * long faces and a door on the front (+z, turned ry). */
export const house = (t: TownBuilders, o: HouseOptions): void => {
  const ry = o.ry ?? 0;
  const storeys = o.storeys ?? 1;
  const h = storeys * STOREY_HEIGHT;
  t.body.box(o.x, 0, o.z, o.w, h, o.d, o.wall, ry);
  t.body.box(o.x, 0, o.z, o.w + 0.006, 0.012, o.d + 0.006, "sandstoneDark", ry);
  t.body.box(o.x, h - 0.006, o.z, o.w + 0.005, 0.006, o.d + 0.005, "brassDark", ry);
  if (o.mansard) {
    t.body.pyramid(o.x, h, o.z, o.w + 0.02, Math.min(o.w, o.d) * (o.roofPitch ?? 1.1), o.d + 0.02, o.roof, ry);
    // A dormer on the front slope.
    const [mx, mz] = at(o.x, o.z, ry, 0, o.d * 0.22);
    t.body.box(mx, h + 0.006, mz, 0.022, 0.024, 0.02, o.wall, ry);
    const [px, pz] = at(mx, mz, ry, 0, 0.0105);
    t.glow.panel(px, h + 0.018, pz, 0.012, 0.012, "lamp", ry);
  } else {
    t.body.gable(o.x, h, o.z, o.w + 0.02, o.d * (o.roofPitch ?? 0.7), o.d + 0.026, o.roof, ry);
  }
  const perStorey = Math.max(1, Math.floor(o.w / 0.045));
  const spacing = o.w / perStorey;
  for (let storey = 0; storey < storeys; storey += 1) {
    const wy = storey * STOREY_HEIGHT + STOREY_HEIGHT * 0.56;
    for (let i = 0; i < perStorey; i += 1) {
      const lx = -o.w / 2 + spacing * (i + 0.5);
      for (const side of [1, -1] as const) {
        if (storey === 0 && side === 1 && i === Math.floor(perStorey / 2)) continue;
        const [wx, wz] = at(o.x, o.z, ry, lx, side * (o.d / 2 + FACE_GAP));
        const lit = t.random() < (o.lit ?? 0.45);
        (lit ? t.glow : t.body).panel(wx, wy, wz, 0.016, 0.022, lit ? "lamp" : "window", side === 1 ? ry : ry + Math.PI);
      }
    }
  }
  const [dx, dz] = at(o.x, o.z, ry, -o.w / 2 + spacing * (Math.floor(perStorey / 2) + 0.5), o.d / 2 + FACE_GAP);
  t.body.panel(dx, 0.02, dz, 0.02, 0.034, "door", ry);
  if (o.chimney) {
    const [cx, cz] = at(o.x, o.z, ry, o.w * 0.28, -o.d * 0.18);
    t.body.box(cx, h, cz, 0.016, o.d * 0.62, 0.016, "brick", ry);
    t.body.box(cx, h + o.d * 0.62, cz, 0.02, 0.006, 0.02, "brassDark", ry);
  }
};

const WALLS: readonly TownColor[] = ["plaster", "sandstone", "brick", "plasterRose", "plaster", "sandstone"];
const ROOFS: readonly TownColor[] = ["roofTerracotta", "copper", "roofSlate", "roofTerracotta", "copper"];

export type CrescentOptions = {
  readonly depth: number;
  readonly storeys: readonly [number, number];
  readonly roofs?: readonly TownColor[];
  readonly lit?: number;
};

/** Crescent of townhouses at `radius` from `fromDeg` to `toDeg`, fronts facing
 * the centre, each house a little different. */
export const crescent = (t: TownBuilders, radius: number, fromDeg: number, toDeg: number, o: CrescentOptions): void => {
  const arc = ((toDeg - fromDeg) * Math.PI * radius) / 180;
  const count = Math.max(1, Math.round(arc / 0.088));
  const step = (toDeg - fromDeg) / count;
  const width = Math.max(0.05, ((step * Math.PI) / 180) * radius - 0.008);
  for (let i = 0; i < count; i += 1) {
    const degrees = fromDeg + step * (i + 0.5);
    const [x, z] = polar(radius, degrees);
    house(t, {
      x, z,
      w: width * (0.92 + t.random() * 0.08),
      d: o.depth,
      storeys: o.storeys[0] + Math.floor(t.random() * (o.storeys[1] - o.storeys[0] + 1)),
      wall: pick(t.random, WALLS),
      roof: pick(t.random, o.roofs ?? ROOFS),
      ry: facingOut(degrees + 180),
      chimney: t.random() < 0.5,
      mansard: t.random() < 0.4,
      lit: o.lit ?? 0.45
    });
  }
};

/** Brass cog facing +z (turned ry), centred on (x, y, z). */
export const gear = (t: TownBuilders, x: number, y: number, z: number, radius: number, ry: number): void => {
  t.body.disc(x, y, z, radius * 0.8, 0.006, "brass", ry);
  for (let i = 0; i < 4; i += 1) t.body.tiltedBox(x, y, z, radius * 2, radius * 0.32, 0.005, "brass", ry, (i * Math.PI) / 4);
  t.body.disc(x, y, z, radius * 0.26, 0.012, "brassDark", ry);
};

/** Square sandstone clock tower with a cog face on every side and a copper spire. */
export const clockTower = (t: TownBuilders, x: number, z: number, size: number, h: number): number => {
  t.body.box(x, 0, z, size, h, size, "sandstone");
  t.body.box(x, h, z, size * 1.16, 0.014, size * 1.16, "brassDark");
  t.body.pyramid(x, h + 0.014, z, size * 1.2, size * 1.6, size * 1.2, "copper");
  for (const side of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const [fx, fz] = at(x, z, side, 0, size / 2 + 0.004);
    gear(t, fx, h - size * 0.62, fz, size * 0.42, side);
  }
  const top = h + 0.014 + size * 1.6;
  t.body.gem(x, top + 0.01, z, 0.009, 0.018, "brass");
  return top + 0.02;
};

/** Stone fountain basin with a brass column. */
export const fountain = (t: TownBuilders, x: number, z: number, radius: number): void => {
  t.body.cylinder(x, 0, z, radius, radius * 1.05, 0.022, "sandstone", 12);
  t.body.cylinder(x, 0.016, z, radius * 0.78, radius * 0.78, 0.008, "water", 12);
  t.body.cylinder(x, 0.02, z, radius * 0.18, radius * 0.24, 0.05, "sandstoneDark", 6);
  t.body.dome(x, 0.07, z, radius * 0.28, "brass", 8, 0.7);
};

/** Market stall: timber counter under a coloured awning. */
export const stall = (t: TownBuilders, x: number, z: number, ry: number, awning: TownColor): void => {
  t.body.box(x, 0, z, 0.05, 0.02, 0.03, "timber", ry);
  t.body.gable(x, 0.034, z, 0.058, 0.016, 0.042, awning, ry);
  for (const side of [-1, 1] as const) {
    const [px, pz] = at(x, z, ry, side * 0.024, 0.016);
    t.body.box(px, 0, pz, 0.004, 0.034, 0.004, "timber", ry);
  }
};

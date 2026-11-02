// Shared pieces for the 3D wreck and battle-scar models (client-map-3d-wreck-overlay.ts).
// Everything is drawn with the production primitive kit (town-mesh-builder) and
// palette the standing buildings use, so a wreck is made of the same iron,
// brass, stone and glass as the structure it was: scorched ground, embers that
// breathe like lamplight, sputtering aether, dark smoke on the steam layer.
import { loopRate, loopSpeed } from "../client-map-3d-town-overlay/town-animation-shaders.js";
import type { TownColor } from "../client-map-3d-town-overlay/town-mesh-builder.js";
import { inStep, polar, type TownBuilders } from "../client-map-3d-town-overlay/town-parts.js";

export type Vec3 = readonly [number, number, number];

/** A soft burn mark on the ground, drawn as a decal by client-map-3d-wreck-overlay.ts. */
export type GroundMark = { readonly x: number; readonly z: number; readonly radius: number };

/** The town primitive kit plus the ground marks a wreck leaves (built once per model). */
export type WreckBuilders = TownBuilders & { readonly marks: GroundMark[] };

/** Deterministic 0..1 roll for a model variant, so a wreck never reshuffles. */
export const wreckRandom = (seed: number): (() => number) => {
  let state = (Math.abs(Math.floor(seed * 7919)) % 2147483646) + 1;
  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

/** Point `radius` out at `degrees` (0 = east, 90 = south), at height y. */
export const at3 = (radius: number, degrees: number, y: number): Vec3 => {
  const [x, z] = polar(radius, degrees);
  return [x, y, z];
};

// Thick pipes (fallen columns, barrels) get round cross-sections; thin ones stay cheap.
export const pipeBetween = (t: TownBuilders, a: Vec3, b: Vec3, radius: number, color: TownColor): void =>
  t.body.pipe(a[0], a[1], a[2], b[0], b[1], b[2], radius, color, radius >= 0.04 ? 18 : radius >= 0.015 ? 10 : 6);

/** A point `fraction` of the way from a to b. */
export const lerp3 = (a: Vec3, b: Vec3, fraction: number): Vec3 =>
  [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction, a[2] + (b[2] - a[2]) * fraction];

/** A collar band round a fallen round piece, at `fraction` along a -> b. */
export const collar = (t: TownBuilders, a: Vec3, b: Vec3, fraction: number, width: number, radius: number, color: TownColor): void => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const half = width / 2 / length;
  pipeBetween(t, lerp3(a, b, fraction - half), lerp3(a, b, fraction + half), radius, color);
};

/** Burnt ground: a soft charred patch with a darker heart and ragged lobes (decals, see GroundMark). */
export const scorch = (t: WreckBuilders, x: number, z: number, radius: number, random: () => number): void => {
  t.marks.push({ x, z, radius });
  t.marks.push({ x, z, radius: radius * 0.55 });
  for (let i = 0; i < 3; i += 1) {
    const [dx, dz] = polar(radius * (0.45 + random() * 0.35), random() * 360);
    t.marks.push({ x: x + dx, z: z + dz, radius: radius * (0.35 + random() * 0.3) });
  }
};

/** A smouldering ember that breathes like lamplight, with a faint glow on the ground. */
export const ember = (t: TownBuilders, x: number, y: number, z: number, size: number, random: () => number, pool = false): void => {
  inStep(t, random(), () => {
    t.glow.gem(x, y, z, size, size * 0.7, random() < 0.6 ? "lampWarm" : "beacon");
    // Red-orange: lamplight's yellow pools would turn green over grass.
    if (pool) t.halo.pool(x, 0.004, z, size * 9, "beacon");
  });
};

/** Torn aether conduit still sputtering where it broke. */
export const aetherSpark = (t: TownBuilders, x: number, y: number, z: number, size: number, random: () => number): void => {
  inStep(t, random(), () => {
    t.glow.gem(x, y, z, size, size * 1.8, "aether");
    t.halo.pool(x, 0.004, z, size * 7, "aether");
  });
};

/**
 * Dark smoke drifting up off a fire at (x, y, z): `puffs` puffs rising
 * `rise` high on a staggered loop (the steam layer's animation, coloured as soot).
 */
export const smokeColumn = (t: TownBuilders, x: number, y: number, z: number, puffs: number, rise: number, random: () => number, size = 0.035): void => {
  const phase = random();
  const rate = loopRate(0.06 + random() * 0.03);
  const driftX = 0.05 + random() * 0.05;
  const driftZ = (random() - 0.5) * 0.06;
  for (let i = 0; i < puffs; i += 1) {
    const anim = { a: [x, y, z, rate], b: [driftX, driftZ, rise, (phase + i / puffs) % 1] } as const;
    t.steam.withAnim(anim, () => t.steam.blob(x, y, z, size * (0.8 + random() * 0.4), i % 3 === 0 ? "graphite" : "window", 0.9));
  }
};

/** Octagonal frame (like the beacon's sensing frames) drawn from pipes, its plane tilted `tilt` about the axis at `yawDegrees`. */
export const octagonFrame = (t: TownBuilders, centre: Vec3, radius: number, tilt: number, yawDegrees: number, tube: number, color: TownColor, gapAt = -1): void => {
  const yaw = (yawDegrees * Math.PI) / 180;
  const point = (k: number): Vec3 => {
    const angle = (k * Math.PI) / 4 + Math.PI / 8;
    const u = Math.cos(angle) * radius;
    const v = Math.sin(angle) * radius;
    // (u, v) in the frame's plane: u along the hinge axis, v up the tilt.
    const vy = v * Math.sin(tilt);
    const vh = v * Math.cos(tilt);
    return [centre[0] + u * Math.cos(yaw) - vh * Math.sin(yaw), centre[1] + vy, centre[2] + u * Math.sin(yaw) + vh * Math.cos(yaw)];
  };
  for (let k = 0; k < 8; k += 1) if (k !== gapAt) pipeBetween(t, point(k), point(k + 1), tube, color);
};

/**
 * Fragments of a broken piece, settled the way debris falls: most of them
 * close to where it broke (thrown toward `towardDegrees`, if given), the big
 * pieces nearest and the small ones flung furthest, each lying flat-ish on
 * the ground and resting on it rather than floating or sunk through it.
 */
export const shards = (t: TownBuilders, x: number, z: number, spread: number, count: number, size: number, color: TownColor, random: () => number, towardDegrees?: number): void => {
  for (let i = 0; i < count; i += 1) {
    const reach = spread * random() ** 1.7;
    const degrees = towardDegrees === undefined ? random() * 360 : towardDegrees + (random() - 0.5) * 110;
    const [dx, dz] = polar(reach, degrees);
    const w = size * (0.5 + random() * 0.9) * (1 - 0.55 * (reach / spread));
    const h = w * (0.22 + random() * 0.22);
    const tilt = (random() - 0.5) * 0.4;
    // Lowest corner on the ground, a little bedded in.
    const rest = (h / 2) * Math.abs(Math.cos(tilt)) + (w / 2) * Math.abs(Math.sin(tilt)) - h * 0.2;
    t.body.tiltedBox(x + dx, rest, z + dz, w, h, w * (0.5 + random() * 0.6), color, random() * Math.PI, tilt);
  }
};

/** A lamp post knocked flat, its lamp dark. */
export const fallenLampPost = (t: TownBuilders, x: number, z: number, degrees: number, height: number): void => {
  const top = at3(height, degrees, 0.012);
  pipeBetween(t, [x, 0.012, z], [x + top[0], 0.012, z + top[2]], 0.005, "iron");
  t.body.box(x + top[0], 0, z + top[2], 0.016, 0.016, 0.016, "ironDark");
};

/** A tree burnt down to a charred trunk and a few blackened limbs. */
export const burntTree = (t: TownBuilders, x: number, z: number, height: number, random: () => number): void => {
  t.body.cylinder(x, 0, z, 0.006, 0.01, height * 0.7, "graphite", 6);
  for (let i = 0; i < 3; i += 1) {
    const end = at3(height * 0.25, random() * 360, height * (0.75 + random() * 0.2));
    pipeBetween(t, [x, height * (0.4 + i * 0.1), z], [x + end[0], end[1], z + end[2]], 0.003, "ironDark");
  }
};

/**
 * A burning fire standing on (x, y, z): three or four tongues of flame, each
 * yellow at the root, orange above and red at the tip, wavering on their own
 * (each turns slowly about an off-centre axis) and flickering like lamplight,
 * with a warm glow thrown on whatever it stands on.
 */
export const flame = (t: TownBuilders, x: number, y: number, z: number, size: number, random: () => number): void => {
  const tongues = 3 + Math.floor(random() * 2);
  for (let i = 0; i < tongues; i += 1) {
    const [dx, dz] = polar(size * (i === 0 ? 0.05 : 0.35 + random() * 0.25), random() * 360);
    const h = size * (i === 0 ? 2.1 : 1.1 + random() * 0.7);
    const r = size * (i === 0 ? 0.55 : 0.32 + random() * 0.12);
    const cx = x + dx, cz = z + dz;
    const anim = { a: [cx + r * 0.25, y, cz, loopSpeed((random() < 0.5 ? -1 : 1) * (1.8 + random() * 1.6))], b: [0, 1, 0, random()] } as const;
    // Hottest at the root, cooling to red at the tip: three stacked bands, not nested shells.
    t.glow.withAnim(anim, () => {
      t.glow.cylinder(cx, y, cz, r * 0.82, r, h * 0.38, "lamp", 6);
      t.glow.cylinder(cx, y + h * 0.38, cz, r * 0.45, r * 0.82, h * 0.34, "lampWarm", 6);
      t.glow.cone(cx, y + h * 0.72, cz, r * 0.45, h * 0.28, "beacon", 6);
    });
  }
  inStep(t, random(), () => t.halo.pool(x, y + 0.003, z, size * 3.2, "lampWarm"));
};

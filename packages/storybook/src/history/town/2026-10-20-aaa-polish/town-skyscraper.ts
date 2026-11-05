// History snapshot: packages/client/src/client-map-3d-town-overlay/town-skyscraper.ts at commit f4007556 (2026-10-20).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// Clockwork skyscrapers: grey stone or glass curtain-wall towers stepping back
// in art-deco setbacks, each set off by an aged-brass band, with lit
// shopfronts spilling light onto the street, lamplit window strips up every
// face and a crown -- a brass cog clock, a needle spire, an alien glowing
// bulb, ribbed fins round a spinning crystal, a brass dome, or a steaming
// smokestack beside a water tank -- the tallest blinking red warning lights.
// Plus the plaza centrepieces: a turning clockwork orrery and a cog lamp.
import type { TownColor } from "./town-mesh-builder.js";
import { at, beacon, facingOut, gear, inStep, polar, spinning, steamVent, TOWN_HALO_Y, type TownBuilders } from "./town-parts.js";

// Clearance off a wall so a window strip never z-fights the wall face.
const FACE_GAP = 0.0025;
const STRIP_PITCH = 0.026;
/** Height of the lit shopfront band round a tower's foot. */
const SHOPFRONT_H = 0.009;
const SHOPFRONT_SPILL = 0.034;
/** Towers at least this tall carry a blinking warning light on their crown. */
export const BEACON_MIN_HEIGHT = 0.3;

export type Crown = "clock" | "spire" | "pod" | "fins" | "dome" | "flat";

export type SkyscraperOptions = {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly ry: number;
  readonly crown: Crown;
  readonly shell?: TownColor;
  /** Glass curtain walls between stone corner piers and floor bands. */
  readonly glass?: boolean;
  /** Sheer all-glass tower, only thin brass bands every few floors. */
  readonly allGlass?: boolean;
  /** Share of window strips lit, 0..1. */
  readonly lit?: number;
};

/** Lamplit (or dark) vertical window strips across one face of a section. */
const windowStrips = (
  t: TownBuilders, x: number, z: number, ry: number, faceWidth: number, offset: number,
  y: number, h: number, lit: number, darkStrips: boolean
): void => {
  const columns = Math.max(1, Math.floor(faceWidth / STRIP_PITCH));
  const pitch = faceWidth / columns;
  for (let i = 0; i < columns; i += 1) {
    const [px, pz] = at(x, z, ry, -faceWidth / 2 + pitch * (i + 0.5), offset + FACE_GAP);
    const isLit = t.random() < lit;
    if (!isLit && !darkStrips) continue;
    (isLit ? t.glow : t.body).panel(px, y + h * 0.5, pz, 0.007, h * 0.78, isLit ? "lamp" : "window", ry);
  }
};

/** Lit shopfronts across one face at street level, their light spilling out over the sidewalk. */
const shopfront = (t: TownBuilders, x: number, z: number, ry: number, faceWidth: number, offset: number, y: number): void => {
  if (t.random() > 0.75) return;
  const [px, pz] = at(x, z, ry, 0, offset + FACE_GAP);
  inStep(t, t.random(), () => {
    t.glow.panel(px, y + SHOPFRONT_H / 2 + 0.002, pz, faceWidth * 0.82, SHOPFRONT_H, "shopfront", ry);
    t.halo.spill(px, TOWN_HALO_Y, pz, faceWidth * 0.95, SHOPFRONT_SPILL, "shopfront", ry);
  });
};

/** Wooden water tank on a post, with a conical iron cap. */
const waterTank = (t: TownBuilders, x: number, y: number, z: number, radius: number): void => {
  t.body.cylinder(x, y, z, radius * 0.18, radius * 0.18, radius * 0.7, "iron", 4);
  t.body.cylinder(x, y + radius * 0.7, z, radius, radius, radius * 1.3, "trunk", 7);
  t.body.cone(x, y + radius * 2, z, radius * 1.08, radius * 0.75, "iron", 7);
};

/** Glass curtain-wall section framed by stone corner piers and floor bands,
 * or (sheer) all glass with only thin brass bands. */
const glassSection = (
  t: TownBuilders, x: number, y: number, z: number, w: number, h: number, d: number, ry: number, frame: TownColor,
  sheer = false
): void => {
  const pane: TownColor = Math.abs(x * 13 + z * 7) % 1 > 0.5 ? "glass" : "glassLight";
  if (sheer) {
    t.body.box(x, y, z, w, h, d, pane, ry);
    for (let band = y + 0.06; band < y + h - 0.02; band += 0.06) {
      t.body.box(x, band, z, w + 0.003, 0.003, d + 0.003, "brassDark", ry);
    }
    return;
  }
  t.body.box(x, y, z, w - 0.004, h, d - 0.004, pane, ry);
  const pier = Math.min(w, d) * 0.16;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const [px, pz] = at(x, z, ry, sx * (w / 2 - pier / 2), sz * (d / 2 - pier / 2));
    t.body.box(px, y, pz, pier, h, pier, frame, ry);
  }
  for (let band = y + 0.045; band < y + h - 0.02; band += 0.045) {
    t.body.box(x, band, z, w + 0.002, 0.004, d + 0.002, frame, ry);
  }
};

/** Builds one skyscraper; returns the top of its crown. */
export const skyscraper = (t: TownBuilders, o: SkyscraperOptions): number => {
  const shell = o.shell ?? "stone";
  const lit = o.lit ?? 0.6;
  const sections = o.h > 0.22 ? [0.58, 0.28, 0.14] : [0.7, 0.3];
  const insets = [1, 0.78, 0.58];
  t.body.box(o.x, 0, o.z, o.w * 1.1, 0.014, o.d * 1.1, "graphite", o.ry);
  let y = 0.014;
  let w = o.w;
  let d = o.d;
  sections.forEach((share, i) => {
    w = o.w * insets[i]!;
    d = o.d * insets[i]!;
    const sh = o.h * share;
    if (o.glass || o.allGlass) glassSection(t, o.x, y, o.z, w, sh, d, o.ry, shell, o.allGlass);
    else t.body.box(o.x, y, o.z, w, sh, d, shell, o.ry);
    // The ground floor's strips start above its shopfronts.
    const stripsFrom = i === 0 ? SHOPFRONT_H + 0.006 : sh * 0.06;
    for (const quarter of [0, 1, 2, 3]) {
      const faceRy = o.ry + (quarter * Math.PI) / 2;
      const across = quarter % 2 === 0 ? w : d;
      const depth = quarter % 2 === 0 ? d : w;
      if (i === 0) shopfront(t, o.x, o.z, faceRy, across, depth / 2, y);
      windowStrips(t, o.x, o.z, faceRy, across * 0.86, depth / 2, y + stripsFrom, (sh - stripsFrom) * 0.88, o.allGlass ? lit * 0.35 : o.glass ? lit * 0.6 : lit, !o.glass && !o.allGlass);
    }
    t.body.box(o.x, y + sh - 0.007, o.z, w + 0.007, 0.007, d + 0.007, "brassDark", o.ry);
    y += sh;
  });
  const size = Math.min(w, d);
  const tall = o.h >= BEACON_MIN_HEIGHT;
  switch (o.crown) {
    case "clock": {
      for (const quarter of [0, 2]) {
        const faceRy = o.ry + (quarter * Math.PI) / 2;
        const [gx, gz] = at(o.x, o.z, faceRy, 0, d / 2 + 0.004);
        gear(t, gx, y - o.h * 0.14 * 0.5, gz, size * 0.36, faceRy);
      }
      t.body.pyramid(o.x, y, o.z, w + 0.006, size * 1.1, d + 0.006, "brass", o.ry);
      if (tall) beacon(t, o.x, y + size * 1.1 + 0.004, o.z);
      return y + size * 1.1 + (tall ? 0.012 : 0);
    }
    case "spire":
      t.body.pyramid(o.x, y, o.z, w, size * 0.5, d, "brassDark", o.ry);
      t.body.cylinder(o.x, y + size * 0.4, o.z, 0.0, 0.009, 0.12, "brass", 6);
      spinning(t, o.x, 0, o.z, [0, 1, 0], 1.2, () => t.glow.gem(o.x, y + size * 0.4 + 0.13, o.z, 0.009, 0.016, "aether"));
      // Halfway up the needle, under the crystal.
      if (tall) beacon(t, o.x, y + size * 0.4 + 0.055, o.z, 0.005);
      return y + size * 0.4 + 0.14;
    case "pod": {
      // Alien bulb on a stalk, ringed in light.
      const podY = y + 0.02 + size * 0.42;
      t.body.cylinder(o.x, y, o.z, size * 0.12, size * 0.2, 0.02, "iron", 8);
      t.body.ellipsoid(o.x, podY, o.z, size * 0.5, size * 0.42, size * 0.5, "graphite");
      t.glow.cylinder(o.x, podY - size * 0.04, o.z, size * 0.5, size * 0.5, size * 0.07, "aether", 12);
      t.body.ring(o.x, podY + size * 0.2, o.z, size * 0.4, "brass", 0.08);
      if (tall) beacon(t, o.x, podY + size * 0.42 + 0.004, o.z);
      return podY + size * 0.45 + (tall ? 0.01 : 0);
    }
    case "fins": {
      // Four ribbed fins curling up round a floating crystal.
      for (const quarter of [0, 1, 2, 3]) {
        const finRy = o.ry + Math.PI / 4 + (quarter * Math.PI) / 2;
        const [fx, fz] = at(o.x, o.z, finRy, 0, size * 0.5);
        t.body.tiltedBox(fx, y + size * 0.45, fz, 0.006, size * 0.9, size * 0.22, "graphite", finRy, 0);
        t.body.gem(fx, y + size * 0.92, fz, 0.006, 0.012, "brass");
      }
      spinning(t, o.x, 0, o.z, [0, 1, 0], 0.9, () => t.glow.gem(o.x, y + size * 0.6, o.z, size * 0.2, size * 0.32, "aether"));
      return y + size * 0.95;
    }
    case "dome":
      t.body.dome(o.x, y, o.z, size * 0.48, "brass", 10, 0.9);
      t.body.gem(o.x, y + size * 0.48, o.z, 0.006, 0.016, "brassDark");
      if (tall) beacon(t, o.x, y + size * 0.48 + 0.02, o.z);
      return y + size * 0.5 + (tall ? 0.026 : 0);
    case "flat": {
      // Plant room with a steaming stack, and a water tank where the roof has room.
      t.body.box(o.x, y, o.z, w * 0.5, 0.014, d * 0.5, "iron", o.ry);
      const [vx, vz] = at(o.x, o.z, o.ry, w * 0.12, 0);
      steamVent(t, vx, y + 0.014, vz);
      if (size > 0.05) {
        const [tx, tz] = at(o.x, o.z, o.ry, -w * 0.3, d * 0.22);
        waterTank(t, tx, y, tz, size * 0.12);
      }
      return y + 0.05;
    }
  }
};

export type TowerRingOptions = {
  readonly count: number;
  readonly radius: number;
  readonly startDeg: number;
  readonly w: number;
  readonly h: readonly [number, number];
  readonly crowns: readonly Crown[];
  readonly shells?: readonly TownColor[];
  /** Height range of the lower annexes set between the towers; none if omitted. */
  readonly annexH?: readonly [number, number];
};

/** Ring of skyscrapers round the plate, fronts facing the plaza, each on its own paved sidewalk. */
export const towerRing = (t: TownBuilders, o: TowerRingOptions): void => {
  const shells = o.shells ?? ["stone", "stoneLight", "stoneDark", "stone"];
  for (let i = 0; i < o.count; i += 1) {
    const degrees = o.startDeg + (i * 360) / o.count;
    const [x, z] = polar(o.radius, degrees);
    t.body.box(x, 0, z, o.w * 1.45, 0.005, o.w * 1.45, "paving", facingOut(degrees + 180));
    skyscraper(t, {
      x, z,
      w: o.w,
      d: o.w * (0.85 + t.random() * 0.15),
      h: o.h[0] + t.random() * (o.h[1] - o.h[0]),
      ry: facingOut(degrees + 180),
      crown: o.crowns[i % o.crowns.length]!,
      shell: shells[i % shells.length]!,
      glass: t.random() < 0.6
    });
    if (o.annexH) {
      const between = degrees + 180 / o.count;
      const [ax, az] = polar(o.radius + 0.01, between);
      t.body.box(ax, 0, az, o.w * 1.15, 0.005, o.w * 1.25, "paving", facingOut(between + 180));
      skyscraper(t, {
        x: ax, z: az,
        w: o.w * 0.78,
        d: o.w * 0.9,
        h: o.annexH[0] + t.random() * (o.annexH[1] - o.annexH[0]),
        ry: facingOut(between + 180),
        crown: t.random() < 0.5 ? "flat" : "dome",
        shell: shells[(i + 2) % shells.length]!
      });
    }
  }
};

/** Brass orrery: a pedestal, tilted-looking stacked hoops and a lamplit core. */
export const orrery = (t: TownBuilders, x: number, z: number, scale: number): number => {
  t.body.cylinder(x, 0, z, 0.03 * scale, 0.036 * scale, 0.016 * scale, "graphite", 8);
  t.body.cylinder(x, 0.016 * scale, z, 0.006 * scale, 0.009 * scale, 0.06 * scale, "brassDark", 8);
  const coreY = 0.1 * scale;
  t.glow.gem(x, coreY, z, 0.018 * scale, 0.026 * scale, "lamp");
  // Each hoop carries its planet round the core at its own pace.
  const orbits = [
    { r: 0.04, dy: 0, a: 0.4, speed: 0.7, color: "brass" },
    { r: 0.03, dy: 0.012, a: 4.1, speed: -1.1, color: "brass" },
    { r: 0.052, dy: -0.012, a: 2.3, speed: 0.45, color: "brassDark" }
  ] as const;
  for (const orbit of orbits) {
    spinning(t, x, 0, z, [0, 1, 0], orbit.speed, () => {
      t.body.ring(x, coreY + orbit.dy * scale, z, orbit.r * scale, orbit.color, 0.06);
      t.body.blob(x + Math.cos(orbit.a) * orbit.r * scale, coreY + orbit.dy * scale, z + Math.sin(orbit.a) * orbit.r * scale, 0.007 * scale, "brass");
    });
  }
  spinning(t, x, 0, z, [0, 1, 0], 0.45, () => {
    t.glow.gem(x + Math.cos(2.3) * 0.052 * scale, coreY, z + Math.sin(2.3) * 0.052 * scale, 0.005 * scale, 0.008 * scale, "aether");
  });
  return coreY + 0.03 * scale;
};

/** Upright brass cog on a plinth with a lantern on top. */
export const cogLamp = (t: TownBuilders, x: number, z: number, radius: number): number => {
  t.body.box(x, 0, z, radius * 1.4, 0.016, radius * 0.8, "graphite");
  t.body.box(x, 0.016, z, 0.008, radius, 0.008, "iron");
  gear(t, x, 0.016 + radius, z, radius, 0);
  t.glow.gem(x, 0.016 + radius * 2.15, z, 0.009, 0.014, "lamp");
  return 0.016 + radius * 2.3;
};

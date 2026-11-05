// History snapshot: packages/client/src/client-map-3d-town-overlay/town-flourishes.ts at commit fc4288dd (2026-10-20).
// Frozen for Storybook's History/Town Progression; edit only to keep it compiling.
// Finishing touches shared by the town layouts: banners flying the owner's
// colour round the plate's edge (and down the megatower), park fountains with spray leaping over a
// mirror pool, flower beds, and rooftop gardens.
import { loopRate, loopSpeed } from "./town-animation-shaders.js";
import type { TownColor } from "./town-mesh-builder.js";
import { at, facingOut, polar, type TownBuilders } from "./town-parts.js";

/** Flagpole at (x, z) flying a banner `length` long, hoisted towards ry. */
export const flagpole = (t: TownBuilders, x: number, z: number, h: number, length: number, ry: number): void => {
  t.body.cylinder(x, 0, z, 0.0022, 0.003, h, "iron", 5);
  t.body.gem(x, h + 0.003, z, 0.0035, 0.006, "brass");
  const depth = length * 0.62;
  const anim = { a: [x, 0, z, loopSpeed(5 + t.random() * 2)], b: [0.2, 0, 0, t.random()] } as const;
  t.banner.withAnim(anim, () => t.banner.cloth(x, h - depth / 2 - 0.002, z, length, depth, "cloth", ry));
};

/** Four banners on the plate's alternate corners, flying round it. Each
 * cloth faces a diagonal, so every quarter-turn of the town shows all four
 * at the same slant instead of two face-on and two edge-on. */
export const plateBanners = (t: TownBuilders, radius: number, h: number): void => {
  for (let k = 0; k < 4; k += 1) {
    const degrees = 22.5 + k * 90;
    const [x, z] = polar(radius * 0.8, degrees);
    flagpole(t, x, z, h, h * 0.62, facingOut(degrees + 22.5));
  }
};

/** Long banner hung flat down a wall from (x, top, z), facing out along ry,
 * stirring so gently (WALL_BANNER_SWING) that it never touches the wall
 * WALL_BANNER_GAP behind it. */
export const WALL_BANNER_GAP = 0.004;
const WALL_BANNER_SWING = 0.04;
export const wallBanner = (t: TownBuilders, x: number, top: number, z: number, w: number, h: number, ry: number): void => {
  const [hx, hz] = at(x, z, ry, -w / 2, 0);
  const anim = { a: [hx, 0, hz, loopSpeed(1.6 + t.random())], b: [WALL_BANNER_SWING, 0, 0, t.random()] } as const;
  t.banner.withAnim(anim, () => t.banner.cloth(hx, top - h / 2, hz, w, h, "cloth", ry));
  t.body.box(x, top, z, w * 1.25, 0.003, 0.004, "brass", ry);
};

/** Round fountain: a stone basin round a mirror pool, spray leaping from a brass jet. */
export const fountain = (t: TownBuilders, x: number, z: number, radius: number): void => {
  t.body.cylinder(x, 0, z, radius, radius * 1.06, 0.007, "stoneLight", 12);
  t.body.cylinder(x, 0.007, z, radius * 0.86, radius * 0.86, 0.003, "water", 12);
  t.body.cylinder(x, 0.007, z, radius * 0.12, radius * 0.16, 0.012, "brass", 6);
  const rate = loopRate(0.55 + t.random() * 0.15);
  const phase = t.random();
  for (let i = 0; i < 5; i += 1) {
    const anim = { a: [x, 0.02, z, rate], b: [0, 0, 0.022, (phase + i / 5) % 1] } as const;
    t.steam.withAnim(anim, () => t.steam.blob(x, 0.02, z, radius * 0.22, "steam", 1));
  }
};

const BLOOMS: readonly TownColor[] = ["blossom", "blossomGold", "blossom"];

/** A ring of `count` flowering shrubs at `radius` round (x, z): green clumps crowned in blossom. */
export const flowerBed = (t: TownBuilders, x: number, z: number, radius: number, count: number, size: number): void => {
  const start = t.random() * 360;
  for (let i = 0; i < count; i += 1) {
    const [fx, fz] = polar(radius, start + (i * 360) / count);
    t.body.blob(x + fx, size * 0.45, z + fz, size, "foliage", 0.7);
    t.body.blob(x + fx, size * 0.95, z + fz, size * 0.62, BLOOMS[i % BLOOMS.length]!, 0.6);
  }
};

/** Rooftop garden on a w x d roof at height y: a planted bed with a little tree and shrubs. */
export const roofGarden = (t: TownBuilders, x: number, y: number, z: number, w: number, d: number, ry: number): void => {
  t.body.box(x, y, z, w * 0.78, 0.004, d * 0.78, "foliage", ry);
  const [sx, sz] = at(x, z, ry, -w * 0.22, d * 0.2);
  t.body.blob(sx, y + 0.008, sz, Math.min(w, d) * 0.12, "foliageLight", 0.8);
  const [bx, bz] = at(x, z, ry, w * 0.24, -d * 0.18);
  t.body.blob(bx, y + 0.006, bz, Math.min(w, d) * 0.08, "blossom", 0.7);
  // The tree stands on the bed, so lift a copy of the shared tree.
  const [tx, tz] = at(x, z, ry, w * 0.1, d * 0.12);
  liftedTree(t, tx, y + 0.004, tz, Math.min(w, d) * 0.4);
};

const liftedTree = (t: TownBuilders, x: number, y: number, z: number, size: number): void => {
  t.body.cylinder(x, y, z, size * 0.1, size * 0.14, size * 0.4, "trunk", 5);
  t.body.blob(x, y + size * 0.58, z, size * 0.36, "foliage");
};

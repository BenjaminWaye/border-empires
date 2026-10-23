// Finishing touches shared by the town layouts: park fountains with spray
// leaping over a mirror pool, flower beds, and rooftop gardens.
import { loopRate } from "./town-animation-shaders.js";
import type { TownColor } from "./town-mesh-builder.js";
import { at, polar, type TownBuilders } from "./town-parts.js";

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

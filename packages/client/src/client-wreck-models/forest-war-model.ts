// A forest fought over (see client-forest-war/forest-war.ts): every tree the
// fighting destroyed, at its own place and size in the tile's forest layout
// (client-map-3d-forest.ts), burnt the way its species burns -- conifers
// stripped to blackened spars with a few scorched tiers left, broadleaves to
// forked, leafless limbs, palms to bare charred poles with a dead frond or two.
//   - snag: a charred trunk still standing, its top broken off;
//   - snapped: a jagged stump with the trunk down beside it, crown and all;
//   - uprooted: the whole tree over on its side, root plate torn out of a pit;
//   - stump: burnt down to a smouldering stump in a ring of ash.
// The forest floor around them is scorched and, as the scars deepen, the
// usual battle debris (battle-scar-models.ts) lies between the trunks, with
// embers in the snags and smoke rising through what is left of the canopy.
import { LAYOUTS } from "../client-map-3d-forest.js";
import { treeFate, type ForestSpecies } from "../client-forest-war/forest-war.js";
import { buildBattleScars } from "./battle-scar-models.js";
import { at3, ember, pipeBetween, smokeColumn, wreckRandom, type Vec3, type WreckBuilders } from "./wreck-kit.js";

type Shape = { readonly trunk: number; readonly radius: number };
// Trunk heights and radii of the forest's tree models (client-map-3d-tree-models.ts),
// with the conifers' spar running on up through the canopy.
const SHAPES: Record<ForestSpecies, Shape> = {
  pine: { trunk: 0.52, radius: 0.03 },
  spruce: { trunk: 0.58, radius: 0.027 },
  leaf: { trunk: 0.36, radius: 0.034 },
  palm: { trunk: 0.62, radius: 0.026 }
};

/**
 * What is left of a fallen crown, lying where it came down round `end` (on the
 * ground): clumps of singed and blackened needles for a conifer, dead brown
 * leaves for a broadleaf, a couple of broken fronds for a palm. `fresh` keeps
 * some green (a tree torn up rather than burnt).
 */
const crownRemains = (t: WreckBuilders, species: ForestSpecies, end: Vec3, degrees: number, scale: number, random: () => number, fresh: boolean): void => {
  if (species === "palm") {
    for (let i = 0; i < 3; i += 1) {
      const tip = at3(0.13 * scale, degrees + (i - 1) * 50, 0.006);
      pipeBetween(t, [end[0], 0.012, end[2]], [end[0] + tip[0], tip[1], end[2] + tip[2]], 0.007, fresh && i === 1 ? "foliage" : "trunk");
    }
    return;
  }
  const clumps = species === "leaf" ? 4 : 3;
  for (let i = 0; i < clumps; i += 1) {
    const [dx, , dz] = at3((0.02 + random() * 0.05) * scale, degrees + (random() - 0.5) * 110, 0);
    const r = (species === "leaf" ? 0.045 : 0.04) * scale * (0.7 + random() * 0.5);
    const color = fresh && random() < 0.6 ? "foliage" : species === "leaf" ? (random() < 0.65 ? "trunk" : "graphite") : random() < 0.55 ? "graphite" : "trunk";
    t.body.blob(end[0] + dx, r * 0.35, end[2] + dz, r, color, 0.5);
  }
};

/** Longest a tree falling from (x, z) at `degrees` can lie without leaving its tile. */
const fitInTile = (x: number, z: number, degrees: number, length: number): number => {
  const [dx, dz] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  const room = (p: number, d: number): number => (Math.abs(d) < 1e-6 ? Infinity : ((d > 0 ? TILE_EDGE : -TILE_EDGE) - p) / d);
  return Math.max(0.08, Math.min(length, room(x, dx), room(z, dz)));
};
const TILE_EDGE = 0.46;

const jaggedTop = (t: WreckBuilders, x: number, y: number, z: number, radius: number, random: () => number): void => {
  for (let i = 0; i < 4; i += 1) {
    const degrees = i * 90 + random() * 40;
    const [dx, , dz] = at3(radius * 0.6, degrees, 0);
    const h = radius * (1.2 + random() * 1.8);
    t.body.tiltedBox(x + dx, y + h / 2 - radius * 0.3, z + dz, radius * 0.9, h, radius * 0.5, i % 2 ? "trunk" : "graphite", Math.PI / 2 - (degrees * Math.PI) / 180, (random() - 0.5) * 0.5);
  }
};

const fallenTree = (t: WreckBuilders, species: ForestSpecies, x: number, z: number, scale: number, degrees: number, fromY: number, shape: Shape, random: () => number, burnt: boolean): void => {
  const length = fitInTile(x, z, degrees, shape.trunk * scale * (burnt ? 0.8 : 1));
  const radius = shape.radius * scale;
  const from: Vec3 = [x, fromY, z];
  const end = at3(length, degrees, radius * 0.9);
  const to: Vec3 = [x + end[0], end[1], z + end[2]];
  pipeBetween(t, from, to, radius * 0.92, burnt ? "window" : "trunk");
  // Broken-off limbs along the trunk.
  for (let i = 0; i < 2; i += 1) {
    const f = 0.45 + i * 0.25;
    const base: Vec3 = [from[0] + (to[0] - from[0]) * f, radius, from[2] + (to[2] - from[2]) * f];
    const limb = at3(0.06 * scale, degrees + (i ? 50 : -55), radius * 1.6);
    pipeBetween(t, base, [base[0] + limb[0], limb[1], base[2] + limb[2]], radius * 0.35, burnt ? "graphite" : "trunk");
  }
  if (!burnt || random() < 0.6) crownRemains(t, species, to, degrees, scale, random, !burnt);
};

const tree = (t: WreckBuilders, species: ForestSpecies, fate: ReturnType<typeof treeFate>, x: number, z: number, scale: number, random: () => number, level: number): void => {
  const shape = SHAPES[species];
  const radius = shape.radius * scale;
  // Trees come down into the tile, not across into the next one.
  const inward = (Math.atan2(-z, -x) * 180) / Math.PI;
  const fall = inward + (random() - 0.5) * 150;
  t.marks.push({ x, z, radius: 0.07 * scale * (fate === "stump" ? 1.3 : 1) });
  if (fate === "snag") {
    const height = shape.trunk * scale * (0.55 + random() * 0.3);
    t.body.cylinder(x, 0, z, radius * 0.55, radius * 1.15, height, "window", 7, random() * Math.PI);
    jaggedTop(t, x, height, z, radius * 0.7, random);
    // Bare, blackened branch stubs.
    for (let i = 0; i < (species === "leaf" ? 2 : 3); i += 1) {
      const y = height * (0.45 + i * 0.17);
      const reach = (species === "leaf" ? 0.11 : 0.05) * scale;
      const tip = at3(reach, random() * 360, y + (species === "leaf" ? 0.07 : 0.015) * scale);
      pipeBetween(t, [x, y, z], [x + tip[0], tip[1], z + tip[2]], radius * 0.3, "graphite");
    }
    if (level >= 3) ember(t, x, height * 0.6, z, 0.006, random);
  } else if (fate === "snapped") {
    const stump = (0.05 + random() * 0.05) * scale;
    t.body.cylinder(x, 0, z, radius * 0.95, radius * 1.2, stump, "graphite", 7);
    jaggedTop(t, x, stump, z, radius, random);
    const [ox, , oz] = at3(radius * 1.4, fall, 0);
    fallenTree(t, species, x + ox, z + oz, scale, fall, radius * 0.95, shape, random, level >= 3);
  } else if (fate === "uprooted") {
    // The root plate stands up out of its pit, clods round the hole.
    t.marks.push({ x, z, radius: 0.05 * scale });
    t.body.disc(x, 0.045 * scale, z, 0.06 * scale, 0.02 * scale, "trunk", (fall * Math.PI) / 180);
    for (let i = 0; i < 5; i += 1) {
      const [dx, , dz] = at3(0.05 * scale, random() * 360, 0);
      t.body.blob(x + dx, 0.006, z + dz, 0.012 * scale, random() < 0.6 ? "trunk" : "stoneDark", 0.6);
    }
    const [ox, , oz] = at3(0.03 * scale, fall, 0);
    fallenTree(t, species, x + ox, z + oz, scale, fall, radius, shape, random, false);
  } else {
    const height = (0.025 + random() * 0.025) * scale;
    t.body.cylinder(x, 0, z, radius * 1.05, radius * 1.3, height, "window", 7);
    jaggedTop(t, x, height, z, radius * 0.8, random);
    if (level >= 2) ember(t, x, height + 0.004, z, 0.007, random, true);
  }
};

/** The forest-war model for one forest layout, species and fate pattern at scar `level`. */
export const buildForestWar = (t: WreckBuilders, level: number, layoutIndex: number, species: ForestSpecies, variant: number): void => {
  const random = wreckRandom(601 + variant * 17 + layoutIndex * 5);
  const layout = LAYOUTS[layoutIndex] ?? LAYOUTS[0]!;
  const trunks = layout.map((p) => ({ x: p.ox, z: p.oz }));
  let smoke = level >= 4 ? 2 : 0;
  layout.forEach((p, slot) => {
    const fate = treeFate(variant, level, slot);
    if (fate === "standing") return;
    tree(t, species, fate, p.ox, p.oz, p.scale, random, level);
    if (smoke > 0 && fate === "snag") {
      smoke -= 1;
      smokeColumn(t, p.ox, 0.3, p.oz, 5, 0.75, random, 0.045);
    }
  });
  // The fighting's debris lies between the trunks, never through them.
  buildBattleScars(t, level, variant, trunks);
};

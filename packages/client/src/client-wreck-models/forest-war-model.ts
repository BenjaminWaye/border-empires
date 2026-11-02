// A forest fought over with beam weapons (see client-forest-war/forest-war.ts):
// every tree the fighting burnt, at its own place and size in the tile's forest
// layout (client-map-3d-forest.ts), burnt the way its kind of forest burns --
// three kinds of forest, three kinds of ruin:
//   - conifers (pine, spruce): stripped to black spars with tiers of dead,
//     blackened branches still in the tree's tapering outline;
//   - broadleaves: bare black trunks with forked, leafless limbs;
//   - palms (tropical forest): black poles with a few burnt fronds hanging.
// A tree is burnt where it stood, sliced through by a beam (a clean angled cut,
// still glowing while fresh, the burnt top down beside the stump), or burnt
// down to a stump. The ground is charred under every tree and the beams' cuts
// and pits run between the trunks (beam-scars.ts). Fresh, the trees still
// smoulder and smoke; later they stand cold and black.
import { LAYOUTS } from "../client-map-3d-forest.js";
import { treeFate, type ForestSpecies, type TreeFate } from "../client-forest-war/forest-war.js";
import { buildBattleScars } from "./battle-scar-models.js";
import { at3, ember, pipeBetween, smokeColumn, wreckRandom, type Vec3, type WreckBuilders } from "./wreck-kit.js";

type Shape = { readonly height: number; readonly radius: number };
// Heights and trunk radii of the forest's tree models (client-map-3d-tree-models.ts):
// conifers' spars run on up through their canopies.
const SHAPES: Record<ForestSpecies, Shape> = {
  pine: { height: 0.6, radius: 0.03 },
  spruce: { height: 0.66, radius: 0.027 },
  leaf: { height: 0.36, radius: 0.034 },
  palm: { height: 0.6, radius: 0.026 }
};

/** A tree burnt where it stands, rooted at the origin of `base` and rising along `up` (a unit vector). */
const burntTree = (t: WreckBuilders, species: ForestSpecies, base: Vec3, up: Vec3, height: number, radius: number, random: () => number): void => {
  const point = (h: number, side = 0, degrees = 0): Vec3 => {
    const [sx, , sz] = at3(side, degrees, 0);
    return [base[0] + up[0] * h + sx, base[1] + up[1] * h, base[2] + up[2] * h + sz];
  };
  if (species === "palm") {
    // A curving black pole, a few burnt fronds hanging off its crown.
    const bend = random() * 360;
    const mid = point(height * 0.55, 0.03, bend);
    const top = point(height, 0.06, bend);
    pipeBetween(t, base, mid, radius, "window");
    pipeBetween(t, mid, top, radius * 0.8, "window");
    // Burnt fronds hanging limp from the crown, bent where they broke.
    for (let i = 0; i < 4; i += 1) {
      const degrees = i * 90 + random() * 40;
      const [dx, , dz] = at3(0.06, degrees, 0);
      const knee: Vec3 = [top[0] + dx, top[1] - 0.01, top[2] + dz];
      const [ex, , ez] = at3(0.08, degrees, 0);
      pipeBetween(t, top, knee, 0.005, "window");
      pipeBetween(t, knee, [top[0] + ex, top[1] - 0.11 - random() * 0.05, top[2] + ez], 0.004, "graphite");
    }
    return;
  }
  const trunkTop = species === "leaf" ? height : height * 0.97;
  t.body.pipe(base[0], base[1], base[2], ...point(trunkTop), radius, "window", 7);
  if (species === "leaf") {
    // Bare forked limbs, each split again into twigs.
    for (let i = 0; i < 3; i += 1) {
      const fork = point(height * (0.6 + i * 0.08));
      const limb = point(height + 0.1, 0.09, i * 120 + random() * 40);
      pipeBetween(t, fork, limb, radius * 0.38, "window");
      for (let k = 0; k < 2; k += 1) {
        const [dx, , dz] = at3(0.05, i * 120 + (k ? 35 : -35), 0);
        pipeBetween(t, limb, [limb[0] + dx, limb[1] + 0.04, limb[2] + dz], radius * 0.18, "graphite");
      }
    }
    return;
  }
  // Conifer: tiers of short dead branches, drooping, shrinking toward the tip.
  const tiers = species === "spruce" ? 5 : 4;
  for (let k = 0; k < tiers; k += 1) {
    const h = height * (0.32 + (k / tiers) * 0.55);
    const reach = (species === "spruce" ? 0.09 : 0.11) * (1 - k / (tiers + 0.5));
    for (let b = 0; b < 5; b += 1) {
      const root = point(h);
      const tip = point(h - reach * 0.45, reach, b * 72 + k * 31 + random() * 20);
      pipeBetween(t, root, tip, radius * 0.22, b % 2 ? "graphite" : "window");
    }
  }
};

const tree = (t: WreckBuilders, species: ForestSpecies, fate: TreeFate, x: number, z: number, scale: number, random: () => number, fresh: boolean): boolean => {
  const shape = SHAPES[species];
  const height = shape.height * scale * (0.85 + random() * 0.2);
  const radius = shape.radius * scale;
  t.marks.push({ x, z, radius: 0.09 * scale }, { x, z, radius: 0.05 * scale });
  if (fate === "charred") {
    burntTree(t, species, [x, 0, z], [0, 1, 0], height, radius, random);
    if (fresh) ember(t, x, height * 0.35, z, 0.006, random);
    return true;
  }
  if (fate === "sliced") {
    // A clean angled cut where the beam went through, the burnt top down beside it.
    const cut = (0.06 + random() * 0.06) * scale;
    const slant = random() * Math.PI;
    t.body.cylinder(x, 0, z, radius, radius * 1.15, cut, "window", 7);
    t.body.tiltedBox(x, cut, z, radius * 2.3, 0.004, radius * 2.1, "trunk", slant, 0.35);
    if (fresh) t.glow.tiltedBox(x, cut + 0.002, z, radius * 1.6, 0.003, radius * 1.4, "lampWarm", slant, 0.35);
    // Toward the tile's middle, so it lies on its own tile.
    const fall = (Math.atan2(-z, -x) * 180) / Math.PI + (random() - 0.5) * 120;
    const [ux, , uz] = at3(1, fall, 0);
    const length = Math.min(height - cut, 0.42);
    burntTree(t, species, [x + ux * radius * 2, radius, z + uz * radius * 2], [ux, 0, uz], length, radius * 0.95, random);
    return false;
  }
  t.body.cylinder(x, 0, z, radius * 1.05, radius * 1.35, (0.025 + random() * 0.02) * scale, "window", 7);
  if (fresh) ember(t, x, 0.03 * scale, z, 0.007, random, true);
  return false;
};

/** The forest-war model for one forest layout, species and fate pattern at scar `level`; `fresh` smoulders. */
export const buildForestWar = (t: WreckBuilders, level: number, layoutIndex: number, species: ForestSpecies, variant: number, fresh = false, riverMask = 0): void => {
  const random = wreckRandom(601 + variant * 17 + layoutIndex * 5);
  const layout = LAYOUTS[layoutIndex] ?? LAYOUTS[0]!;
  const trunks = layout.map((p) => ({ x: p.ox, z: p.oz }));
  let smoke = fresh ? 2 : 0;
  layout.forEach((p, slot) => {
    const fate = treeFate(variant, level, slot);
    // No tree grew there (the forest keeps its trees off river banks), so none burnt either.
    if (fate === "standing" || (riverMask & (1 << slot)) !== 0) return;
    const standing = tree(t, species, fate, p.ox, p.oz, p.scale, random, fresh);
    if (smoke > 0 && standing) {
      smoke -= 1;
      smokeColumn(t, p.ox, SHAPES[species].height * p.scale * 0.6, p.oz, 5, 0.8, random, 0.045);
    }
  });
  // The beams' cuts and pits run between the trunks.
  buildBattleScars(t, level, variant, fresh, trunks);
};

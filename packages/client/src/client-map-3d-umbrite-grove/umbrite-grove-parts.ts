import { CylinderGeometry, Euler, IcosahedronGeometry, Matrix4, Quaternion, Vector3, type BufferGeometry } from "three";
import { createSplitTimberGeometry, type SplitTimberOptions } from "./umbrite-split-timber.js";

// The three Umbrite discoveries in a forest -- the map's three deposit
// variants (client-map-3d-umbrite-deposit.ts) and the Storybook study
// (Sandbox / Umbrite Forest). Only the mineralized wood lives here; the
// living trees around it come from UMBRITE_GROVE_TREES, drawn with the
// ordinary forest tree models. Coordinates are tile-local: one tile spans
// about -0.5..0.5 on x/z, y is up from the ground.
export type UmbriteGroveConcept = "roots" | "rootbed" | "fallen";
export const UMBRITE_GROVE_CONCEPTS: readonly UmbriteGroveConcept[] = ["roots", "rootbed", "fallen"];
export const UMBRITE_GROVE_CONCEPT_NAMES: Readonly<Record<UmbriteGroveConcept, string>> = {
  roots: "A · Root-Bearing Elder",
  rootbed: "B · Umbrite Rootbed",
  fallen: "C · Fallen Umberwood"
};
export type UmbriteGroveSpecies = "pine" | "spruce" | "broadleaf" | "palm";
export type UmbriteGroveMaterial = "bark" | "darkBark" | "wood" | "purple" | "purpleLight";
export const UMBRITE_GROVE_MATERIALS: readonly UmbriteGroveMaterial[] = ["bark", "darkBark", "wood", "purple", "purpleLight"];
/** One piece of mineralized wood, already placed in tile space by `matrix`. */
export type UmbriteGrovePart = { readonly geometry: BufferGeometry; readonly material: UmbriteGroveMaterial; readonly matrix: Matrix4 };

type Point = readonly [number, number, number];
/** [x, z, scale] of each living tree, kept clear of the discovery itself. */
export const UMBRITE_GROVE_TREES: Readonly<Record<UmbriteGroveConcept, readonly Point[]>> = {
  roots: [[-0.28, -0.23, 0.88], [-0.025, -0.29, 0.72], [0.26, -0.22, 0.95],
    [-0.32, 0.045, 0.67], [0.32, 0.065, 0.65], [-0.34, 0.28, 0.47]],
  rootbed: [[-0.31, -0.28, 0.72], [-0.09, -0.19, 0.94], [0.2, -0.32, 0.79],
    [0.34, -0.045, 0.9], [-0.32, 0.15, 0.64], [0.28, 0.28, 0.48]],
  fallen: [[-0.29, -0.31, 0.97], [0.07, -0.29, 0.81], [0.32, -0.2, 0.67],
    [-0.33, -0.045, 0.59], [0.32, 0.055, 0.8], [-0.35, 0.31, 0.43]]
};
/** Where exposed mineral glows, for a study scene's local violet lights. */
export const UMBRITE_GROVE_GLOWS: Readonly<Record<UmbriteGroveConcept, readonly Point[]>> = {
  roots: [[0, 0.12, 0.13], [0, 0.33, 0.12]],
  rootbed: [[-0.1, 0.045, 0.19], [0.13, 0.04, 0.23]],
  fallen: [[-0.22, 0.12, 0.19], [-0.07, 0.055, 0.25], [0.26, 0.035, 0.34]]
};
// The forest tree models' base radii (pine .032, spruce .028, broadleaf
// .034, palm .038), at a normal forest tree scale.
const TRUNK_RADIUS: Readonly<Record<UmbriteGroveSpecies, number>> = { pine: 0.032, spruce: 0.028, broadleaf: 0.034, palm: 0.038 };

export const buildUmbriteGroveParts = (concept: UmbriteGroveConcept, species: UmbriteGroveSpecies = "pine"): UmbriteGrovePart[] => {
  const parts: UmbriteGrovePart[] = [];
  const add = (geometry: BufferGeometry, material: UmbriteGroveMaterial, matrix = new Matrix4()): void => {
    parts.push({ geometry, material, matrix });
  };
  const UP = new Vector3(0, 1, 0);
  const branch = (from: Point, to: Point, base: number, tip: number, material: UmbriteGroveMaterial): void => {
    const start = new Vector3(...from);
    const end = new Vector3(...to);
    const direction = end.clone().sub(start);
    // Bend the trunk between its fixed endpoints, and vary the bark radius
    // gently so forks do not look like a collection of straight tubes.
    const length = direction.length();
    const geometry = new CylinderGeometry(tip, base, length, 9, 6);
    const vertices = geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i += 1) {
      const t = vertices.getY(i) / length + 0.5;
      const swell = 1 + 0.07 * Math.sin(t * Math.PI * 3);
      vertices.setX(i, vertices.getX(i) * swell + Math.sin(t * Math.PI) * base * 0.32);
      vertices.setZ(i, vertices.getZ(i) * swell + Math.sin(t * Math.PI * 2) * base * 0.12);
    }
    geometry.computeVertexNormals();
    const rotation = new Quaternion().setFromUnitVectors(UP, direction.normalize());
    add(geometry, material, new Matrix4().compose(start.add(end).multiplyScalar(0.5), rotation, new Vector3(1, 1, 1)));
  };
  const timber = (options: SplitTimberOptions): void => {
    const geometry = createSplitTimberGeometry(options);
    add(geometry.bark, "darkBark");
    add(geometry.heartwood, "purple");
    add(geometry.tornEdges, "wood");
  };
  const blob = (radius: number, detail: number, material: UmbriteGroveMaterial, at: Point, scale: Point, rotation: Point = [0, 0, 0]): void => {
    const quaternion = new Quaternion().setFromEuler(new Euler(...rotation));
    add(new IcosahedronGeometry(radius, detail), material, new Matrix4().compose(new Vector3(...at), quaternion, new Vector3(...scale)));
  };
  const trunkRadius = TRUNK_RADIUS[species] * 0.92;
  // Mineralized wood fragments are thin splinters, never oversized boulders.
  const splinter = (x: number, z: number, length: number, width: number, angle: number, bright = false): void =>
    blob(1, 0, bright ? "purpleLight" : "purple", [x, width * 0.5 + 0.003, z], [width, width * 0.6, length], [0.12, angle, 0.18]);
  const root = (angle: number, length: number, thickness: number): void => {
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const bend = angle + 0.27;
    const p0: Point = [dx * 0.012, 0.042 * thickness, 0.09 + dz * 0.012];
    const p1: Point = [dx * length * 0.38, 0.023 * thickness, 0.09 + dz * length * 0.38];
    const p2: Point = [Math.cos(bend) * length * 0.72, 0.016, 0.09 + Math.sin(bend) * length * 0.72];
    const p3: Point = [Math.cos(bend + 0.1) * length, 0.006, 0.09 + Math.sin(bend + 0.1) * length];
    const points = [p0, p1, p2, p3];
    for (let i = 0; i < 3; i += 1) {
      const from = points[i]!;
      const to = points[i + 1]!;
      const radius = trunkRadius * thickness * (0.8 - i * 0.21);
      branch(from, to, radius, radius * 0.68, "darkBark");
      // Broken bark exposes only parts of the root; alternating brown runs
      // interrupt the mineral, rather than outlining every root in purple.
      if (i !== 2 || angle > 1) {
        const start = new Vector3(...from).lerp(new Vector3(...to), i === 0 ? 0.38 : 0.08);
        const end = new Vector3(...from).lerp(new Vector3(...to), i === 1 ? 0.7 : 0.85);
        branch([start.x, start.y + radius * 0.6, start.z], [end.x, end.y + radius * 0.5, end.z], radius * 0.72, radius * 0.47, "purple");
        branch([start.x, start.y + radius * 1.15, start.z], [end.x, end.y + radius * 0.95, end.z], radius * 0.12, radius * 0.07, "purpleLight");
      }
    }
    const forkAngle = bend - 0.6;
    branch(p1, [p1[0] + Math.cos(forkAngle) * length * 0.42, 0.008, p1[2] + Math.sin(forkAngle) * length * 0.42],
      trunkRadius * thickness * 0.35, 0.002, "bark");
  };
  if (concept === "roots") buildRootBearingElder(species, trunkRadius, branch, blob, root, splinter);
  else if (concept === "rootbed") buildRootbed(trunkRadius, branch, timber);
  else buildFallenUmberwood(trunkRadius, branch, timber, splinter);
  return parts;
};

type Branch = (from: Point, to: Point, base: number, tip: number, material: UmbriteGroveMaterial) => void;
type Timber = (options: SplitTimberOptions) => void;
type Splinter = (x: number, z: number, length: number, width: number, angle: number, bright?: boolean) => void;
type Blob = (radius: number, detail: number, material: UmbriteGroveMaterial, at: Point, scale: Point) => void;

// A · The entire tree has mineralized: an asymmetric bare crown replaces the
// ordinary canopy. Intact bark survives between exposed core faces.
const buildRootBearingElder = (
  species: UmbriteGroveSpecies, trunkRadius: number, branch: Branch, blob: Blob,
  root: (angle: number, length: number, thickness: number) => void, splinter: Splinter
): void => {
  const limb = (from: Point, to: Point, base: number, tip: number, exposed: boolean): void => {
    branch(from, to, base, tip, "bark");
    if (!exposed) return;
    const start = new Vector3(...from).lerp(new Vector3(...to), 0.22);
    const end = new Vector3(...from).lerp(new Vector3(...to), base > 0.015 ? 0.78 : 0.68);
    branch([start.x, start.y, start.z + base * 0.72], [end.x, end.y, end.z + tip * 0.72], base * 0.59, tip * 0.58, "purple");
  };
  const t0: Point = [0, 0.005, 0.09];
  const t1: Point = [-0.014, 0.19, 0.09];
  const t2: Point = [0.009, 0.35, 0.08];
  const t3: Point = [-0.018, 0.54, 0.1];
  limb(t0, t1, trunkRadius, trunkRadius * 0.83, true);
  limb(t1, t2, trunkRadius * 0.83, trunkRadius * 0.56, true);
  limb(t2, t3, trunkRadius * 0.56, 0.004, true);
  [t1, t2].forEach((point, i) => blob(trunkRadius * (i === 0 ? 0.88 : 0.6), 1, "bark", point, [1, 1.35, 0.95]));
  // A broadleaf has spreading forks; stripped conifers keep tiered limbs.
  const crownWidth = species === "broadleaf" ? 0.3 : species === "palm" ? 0.24 : 0.28;
  for (let tier = 0; tier < 3; tier += 1) {
    for (let side = 0; side < 4; side += 1) {
      const angle = side * Math.PI * 2 / 4 + tier * 0.83 + 0.3 + Math.sin(side * 4.1 + tier) * 0.22;
      const span = crownWidth * (1 - tier * 0.2) * (0.83 + 0.2 * Math.sin(side * 2.8 + tier * 1.6));
      const height = 0.19 + tier * 0.115 + Math.sin(side * 2.6) * 0.018;
      const start: Point = [tier === 0 ? -0.014 : 0.004, height, 0.09];
      const elbow: Point = [Math.cos(angle) * span * 0.63, height + 0.02, 0.09 + Math.sin(angle) * span * 0.63];
      const tip: Point = [Math.cos(angle + 0.2) * span, height + 0.09 + side * 0.009, 0.09 + Math.sin(angle + 0.2) * span];
      limb(start, elbow, trunkRadius * (0.44 - tier * 0.08), 0.006, (side + tier) % 2 === 0);
      limb(elbow, tip, 0.006, 0.002, true);
      limb(tip, [tip[0] + Math.cos(angle + 0.8) * 0.055, tip[1] + 0.028, tip[2] + Math.sin(angle + 0.8) * 0.055], 0.0025, 0.0008, false);
      limb(elbow, [Math.cos(angle - 0.48) * span * 0.96, height + 0.055, 0.09 + Math.sin(angle - 0.48) * span * 0.96], 0.004, 0.001, side % 2 === 0);
      limb(elbow, [elbow[0] + Math.cos(angle - 0.7) * 0.06, elbow[1] + 0.065, elbow[2] + Math.sin(angle - 0.7) * 0.06], 0.004, 0.001, false);
    }
  }
  [0.08, 0.86, 1.65, 2.55, 3.7].forEach((angle, i) => root(angle, 0.165 + (i % 3) * 0.018, 0.64));
  branch([0.08, 0.022, 0.29], [0.26, 0.015, 0.32], 0.011, 0.005, "bark");
  branch([0.12, 0.028, 0.3], [0.21, 0.023, 0.315], 0.007, 0.005, "purple");
  branch([0.19, 0.017, 0.31], [0.24, 0.008, 0.4], 0.005, 0.001, "bark");
  splinter(0.18, 0.28, 0.037, 0.012, 1.1);
  splinter(-0.13, 0.37, 0.025, 0.01, 2.2, true);
};

// B · A ground-level discovery: living forest above an exposed network of
// mineralized roots. Every main run begins at a living tree base (see
// UMBRITE_GROVE_TREES.rootbed), and each root is narrower than its trunk.
const buildRootbed = (r: number, branch: Branch, timber: Timber): void => {
  type RootRun = { readonly points: readonly Point[]; readonly radius: number; readonly seed: number };
  const runs: readonly RootRun[] = [
    { points: [[-0.32, -0.003, 0.15], [-0.22, -0.002, 0.17], [-0.1, -0.004, 0.23], [0.065, -0.012, 0.26], [0.2, -0.014, 0.285]], radius: r * 0.3, seed: 7 },
    { points: [[0.28, -0.004, 0.28], [0.19, -0.002, 0.19], [0.08, -0.004, 0.12], [-0.02, -0.006, 0.065], [-0.075, -0.014, -0.065]], radius: r * 0.23, seed: 16 },
    { points: [[-0.32, -0.005, 0.15], [-0.21, -0.003, 0.28], [-0.11, -0.009, 0.34], [0.035, -0.014, 0.35]], radius: r * 0.18, seed: 22 },
    { points: [[0.34, -0.003, -0.045], [0.26, -0.002, 0.025], [0.19, -0.008, 0.105], [0.16, -0.014, 0.18]], radius: r * 0.25, seed: 5 },
    { points: [[-0.09, -0.004, -0.19], [-0.12, -0.003, -0.065], [-0.075, -0.005, 0.04], [-0.12, -0.013, 0.14]], radius: r * 0.24, seed: 10 },
    { points: [[-0.32, -0.004, 0.15], [-0.24, -0.003, 0.075], [-0.13, -0.005, 0.055], [-0.025, -0.014, 0.1]], radius: r * 0.2, seed: 12 },
    { points: [[0.28, -0.004, 0.28], [0.22, -0.003, 0.34], [0.1, -0.005, 0.38], [-0.005, -0.014, 0.4]], radius: r * 0.22, seed: 19 },
    { points: [[0.34, -0.004, -0.045], [0.2, -0.003, -0.015], [0.105, -0.005, 0.015], [0.02, -0.013, -0.025]], radius: r * 0.2, seed: 24 },
    // Smaller daughter roots branch from the exposed parent runs.
    { points: [[-0.22, -0.002, 0.17], [-0.16, -0.004, 0.135], [-0.065, -0.013, 0.16]], radius: r * 0.14, seed: 4 },
    { points: [[-0.1, -0.004, 0.23], [-0.055, -0.004, 0.29], [0.045, -0.013, 0.32]], radius: r * 0.13, seed: 8 },
    { points: [[0.19, -0.002, 0.19], [0.12, -0.004, 0.215], [0.025, -0.013, 0.195]], radius: r * 0.15, seed: 14 },
    { points: [[-0.12, -0.003, -0.065], [-0.2, -0.004, -0.025], [-0.23, -0.013, 0.045]], radius: r * 0.13, seed: 26 }
  ];
  runs.forEach((run) => timber({
    points: run.points, baseRadius: run.radius, tipRadius: 0.0007, taperPower: 1.55,
    opening: [0, 1, 0.3], gap: 1.8, seed: run.seed, cracks: true, crackPhase: -1 + (run.seed % 3) * 0.3
  }));
  // Rootlets fork close to their parent run and disappear under the soil.
  branch([-0.22, -0.005, 0.17], [-0.24, -0.014, 0.07], 0.0025, 0.0004, "bark");
  branch([-0.14, -0.007, 0.32], [-0.16, -0.014, 0.405], 0.0018, 0.0003, "darkBark");
  branch([0.11, -0.007, 0.145], [0.015, -0.014, 0.19], 0.002, 0.0003, "bark");
  branch([0.23, -0.006, 0.06], [0.285, -0.014, 0.12], 0.0022, 0.0004, "darkBark");
};

// C · A rooted stump and a detached stem tell one clear tree-fall story,
// with daylight between the break and the log.
const buildFallenUmberwood = (r: number, branch: Branch, timber: Timber, splinter: Splinter): void => {
  timber({ points: [[-0.21, 0.005, 0.16], [-0.215, 0.065, 0.16], [-0.22, 0.125, 0.165]],
    baseRadius: r * 1.12, tipRadius: r * 0.83, opening: [0.15, 0.5, 1], gap: 0.8, seed: 24 });
  // Mineral fibres protrude through the jagged stump, still held by bark.
  branch([-0.22, 0.07, 0.17], [-0.224, 0.14, 0.174], r * 0.48, r * 0.25, "purple");
  branch([-0.204, 0.08, 0.178], [-0.195, 0.135, 0.195], r * 0.22, 0.002, "purpleLight");
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI / 2 + 0.3;
    branch([-0.21, 0.023, 0.16], [-0.21 + Math.cos(angle) * 0.07, 0.005, 0.16 + Math.sin(angle) * 0.07], r * 0.4, 0.002, "darkBark");
  }
  timber({ points: [[-0.105, r, 0.235], [-0.015, r * 1.2, 0.25], [0.12, r, 0.28], [0.24, r * 0.65, 0.32], [0.32, 0.008, 0.36]],
    baseRadius: r * 0.95, tipRadius: r * 0.18, opening: [0, 1, 0.3], gap: 1.4, seed: 17, cracks: true });
  // Attached crown limbs keep bark through their forks: mineral shows only
  // where bark has broken, never as purple roots sprouting from a face.
  branch([0.09, 0.025, 0.273], [0.145, 0.02, 0.365], r * 0.4, 0.006, "bark");
  branch([0.145, 0.02, 0.365], [0.25, 0.009, 0.42], 0.006, 0.002, "bark");
  branch([0.15, 0.02, 0.37], [0.105, 0.009, 0.435], 0.004, 0.001, "bark");
  branch([0.21, 0.014, 0.4], [0.285, 0.008, 0.395], 0.003, 0.0007, "bark");
  branch([0.04, 0.025, 0.262], [0.12, 0.028, 0.185], r * 0.35, 0.006, "darkBark");
  branch([0.12, 0.028, 0.185], [0.22, 0.009, 0.145], 0.006, 0.002, "bark");
  branch([0.13, 0.025, 0.18], [0.12, 0.01, 0.12], 0.003, 0.0007, "bark");
  branch([0.25, 0.016, 0.325], [0.36, 0.008, 0.28], 0.004, 0.0008, "bark");
  // Short fibres and chips connect the two matching breaks visually.
  branch([-0.11, 0.032, 0.238], [-0.125, 0.025, 0.222], 0.005, 0.001, "wood");
  splinter(-0.16, 0.225, 0.025, 0.009, 0.7, true);
  splinter(-0.19, 0.26, 0.019, 0.006, 1.1);
};

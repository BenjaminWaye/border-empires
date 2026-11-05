import {
  CircleGeometry, CylinderGeometry, DoubleSide, FrontSide, Group, IcosahedronGeometry, Mesh,
  MeshStandardMaterial, PointLight, Vector3, type BufferGeometry
} from "three";
import {
  createLeafGeometry, createPalmGeometry, createPineGeometry, createSpruceGeometry
} from "@client/client-map-3d-trees/client-map-3d-tree-models.js";

import { createSplitTimberGeometry, type SplitTimberOptions } from "./umbrite-split-timber.js";
import { createForestSurfaces } from "./umbrite-forest-surfaces.js";

// Proposed art only: these scenes do not change live resource rendering or canon.
// Forest placement allows umbrite on dark GRASS at every forest latitude.
// createForest selects ONE species per tile; tropical forest uses only palms.
export type ForestSpecies = "pine" | "spruce" | "broadleaf" | "palm";
export const FOREST_SPECIES: readonly ForestSpecies[] = ["pine", "spruce", "broadleaf", "palm"];
export const SPECIES_NAMES: Readonly<Record<ForestSpecies, string>> = {
  pine: "Pine forest", spruce: "Spruce forest", broadleaf: "Broadleaf forest", palm: "Tropical palm forest"
};
export type ForestConcept = "roots" | "rootbed" | "fallen";
export const FOREST_CONCEPTS: readonly ForestConcept[] = ["roots", "rootbed", "fallen"];
export const CONCEPT_NAMES: Readonly<Record<ForestConcept, string>> = {
  roots: "A · Root-Bearing Elder",
  rootbed: "B · Umbrite Rootbed",
  fallen: "C · Fallen Umberwood"
};

type Point = readonly [number, number, number];
export type ForestConceptModel = { readonly group: Group; readonly dispose: () => void };

export const createForestConcept = (
  concept: ForestConcept, revealed: boolean, species: ForestSpecies = "pine"
): ForestConceptModel => {
  const group = new Group();
  const geometries: BufferGeometry[] = [];
  const material = (color: string, roughness = 0.9, metalness = 0): MeshStandardMaterial =>
    new MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  const surfaces = createForestSurfaces();
  const bark = material("#a17c59");
  const darkBark = material("#70523d");
  const wood = material("#927051");
  wood.side = DoubleSide;
  const purple = material("#a365c7", 0.58, 0.06);
  purple.emissive.set("#b45aff");
  purple.emissiveIntensity = 2.5;
  const purpleLight = material("#d3ade9", 0.55, 0.04);
  purpleLight.emissive.set("#c785ff");
  purpleLight.emissiveIntensity = 2;
  const purpleDark = material("#4e3265", 0.65, 0.1);
  bark.flatShading = false;
  darkBark.flatShading = false;
  bark.map = surfaces.bark;
  bark.bumpMap = surfaces.bark;
  bark.bumpScale = 0.002;
  darkBark.map = surfaces.bark;
  darkBark.bumpMap = surfaces.bark;
  darkBark.bumpScale = 0.002;
  const ground = material("#c5c8a0");
  ground.map = surfaces.ground;
  const leaves = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: species === "palm" ? DoubleSide : FrontSide });
  const shadow = new MeshStandardMaterial({ color: "#273125", transparent: true, opacity: 0.22, depthWrite: false });
  const materials = [bark, darkBark, wood, purple, purpleLight, purpleDark, ground, leaves, shadow];
  const mesh = (geo: BufferGeometry, mat: MeshStandardMaterial, parent = group): Mesh => {
    geometries.push(geo);
    const result = new Mesh(geo, mat);
    result.castShadow = true;
    result.receiveShadow = true;
    parent.add(result);
    return result;
  };
  const branch = (from: Point, to: Point, base: number, tip: number, mat: MeshStandardMaterial, parent = group): Mesh => {
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
    const result = mesh(geometry, mat, parent);
    result.position.copy(start.add(end).multiplyScalar(0.5));
    result.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
    return result;
  };
  const timber = (options: SplitTimberOptions, dark = false): void => {
    const geometry = createSplitTimberGeometry(options);
    mesh(geometry.bark, dark ? darkBark : bark);
    mesh(geometry.heartwood, purple);
    mesh(geometry.tornEdges, wood);
  };
  const tile = mesh(new CylinderGeometry(0.69, 0.69, 0.035, 4), ground);
  tile.castShadow = false;
  tile.rotation.y = Math.PI / 4;
  tile.position.y = -0.026;

  const factories = {
    pine: createPineGeometry, spruce: createSpruceGeometry,
    broadleaf: createLeafGeometry, palm: createPalmGeometry
  };
  const tree = (x: number, z: number, scale: number): void => {
    const geometry = factories[species]();
    const result = mesh(geometry, leaves);
    result.position.set(x, 0, z);
    result.rotation.y = (x + z) * 4;
    result.scale.setScalar(scale);
    const contact = mesh(new CircleGeometry(0.13 * scale, 12), shadow);
    contact.castShadow = false;
    contact.rotation.x = -Math.PI / 2;
    contact.position.set(x, -0.003, z);
  };

  if (!revealed) {
    const positions: readonly Point[] = [
      [-0.3, 0, -0.28], [0, 0, -0.31], [0.3, 0, -0.25],
      [-0.28, 0, 0.02], [0.03, 0, 0.02], [0.3, 0, 0.05],
      [-0.3, 0, 0.29], [0.05, 0, 0.31]
    ];
    positions.forEach(([x, , z], i) => tree(x, z, 0.8 + (i % 3) * 0.07));
  } else {
    // Each discovery has its own stable clearing, spacing and tree sizes.
    // Keep living trunks away from the resource silhouette and fallen wood.
    const layouts: Readonly<Record<ForestConcept, readonly Point[]>> = {
      roots: [[-0.28, -0.23, 0.88], [-0.025, -0.29, 0.72], [0.26, -0.22, 0.95],
        [-0.32, 0.045, 0.67], [0.32, 0.065, 0.65], [-0.34, 0.28, 0.47]],
      rootbed: [[-0.31, -0.28, 0.72], [-0.09, -0.19, 0.94], [0.2, -0.32, 0.79],
        [0.34, -0.045, 0.9], [-0.32, 0.15, 0.64], [0.28, 0.28, 0.48]],
      fallen: [[-0.29, -0.31, 0.97], [0.07, -0.29, 0.81], [0.32, -0.2, 0.67],
        [-0.33, -0.045, 0.59], [0.32, 0.055, 0.8], [-0.35, 0.31, 0.43]]
    };
    layouts[concept].forEach(([x, z, scale]) => tree(x, z, scale));
    // Only exposed mineral emits. These small local lights add reflected
    // violet to nearby bark/soil; HDR bloom supplies the soft visible halo.
    const glowPositions: readonly Point[] = concept === "fallen"
      ? [[-0.22, 0.12, 0.19], [-0.07, 0.055, 0.25], [0.26, 0.035, 0.34]]
      : concept === "roots" ? [[0, 0.12, 0.13], [0, 0.33, 0.12]] : [[-0.1, 0.045, 0.19], [0.13, 0.04, 0.23]];
    glowPositions.forEach((position) => {
      const light = new PointLight("#b869ff", 0.004, 0.25, 2);
      light.position.set(...position);
      group.add(light);
    });
    // Match the source models' base radii (pine .032, spruce .028,
    // broadleaf .034, palm .038), at a normal forest tree scale.
    const trunkRadius = { pine: 0.032, spruce: 0.028, broadleaf: 0.034, palm: 0.038 }[species] * 0.92;
    // Mineralized wood fragments are thin splinters, never oversized boulders.
    const splinter = (x: number, z: number, length: number, width: number, angle: number, bright = false): void => {
      const piece = mesh(new IcosahedronGeometry(1, 0), bright ? purpleLight : purple);
      piece.scale.set(width, width * 0.6, length);
      piece.position.set(x, width * 0.5 + 0.003, z);
      piece.rotation.set(0.12, angle, 0.18);
    };
    const root = (angle: number, length: number, thickness = 1): void => {
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
        branch(from, to, radius, radius * 0.68, darkBark);
        // Broken bark exposes only parts of the root; alternating brown runs
        // interrupt the mineral, rather than outlining every root in purple.
        if (i !== 2 || angle > 1) {
          const start = new Vector3(...from).lerp(new Vector3(...to), i === 0 ? 0.38 : 0.08);
          const end = new Vector3(...from).lerp(new Vector3(...to), i === 1 ? 0.7 : 0.85);
          branch([start.x, start.y + radius * 0.6, start.z],
            [end.x, end.y + radius * 0.5, end.z], radius * 0.72, radius * 0.47, purple);
          branch([start.x, start.y + radius * 1.15, start.z],
            [end.x, end.y + radius * 0.95, end.z], radius * 0.12, radius * 0.07, purpleLight);
        }
      }
      const forkAngle = bend - 0.6;
      branch(p1, [p1[0] + Math.cos(forkAngle) * length * 0.42, 0.008,
        p1[2] + Math.sin(forkAngle) * length * 0.42], trunkRadius * thickness * 0.35, 0.002, bark);
    };
    if (concept === "roots") {
      // The entire tree has mineralized: an asymmetric bare crown replaces
      // the ordinary canopy. Intact bark survives between exposed core faces.
      const limb = (from: Point, to: Point, base: number, tip: number, exposed: boolean): void => {
        branch(from, to, base, tip, bark);
        if (!exposed) return;
        const start = new Vector3(...from).lerp(new Vector3(...to), 0.22);
        const end = new Vector3(...from).lerp(new Vector3(...to), base > 0.015 ? 0.78 : 0.68);
        branch([start.x, start.y, start.z + base * 0.72],
          [end.x, end.y, end.z + tip * 0.72], base * 0.59, tip * 0.58, purple);
      };
      const t0: Point = [0, 0.005, 0.09];
      const t1: Point = [-0.014, 0.19, 0.09];
      const t2: Point = [0.009, 0.35, 0.08];
      const t3: Point = [-0.018, 0.54, 0.1];
      limb(t0, t1, trunkRadius, trunkRadius * 0.83, true);
      limb(t1, t2, trunkRadius * 0.83, trunkRadius * 0.56, true);
      limb(t2, t3, trunkRadius * 0.56, 0.004, true);
      [t1, t2].forEach((point, i) => {
        const knot = mesh(new IcosahedronGeometry(trunkRadius * (i === 0 ? 0.88 : 0.6), 1), bark);
        knot.position.set(...point);
        knot.scale.set(1, 1.35, 0.95);
      });
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
          const forkTip: Point = [tip[0] + Math.cos(angle + 0.8) * 0.055,
            tip[1] + 0.028, tip[2] + Math.sin(angle + 0.8) * 0.055];
          limb(tip, forkTip, 0.0025, 0.0008, false);
          limb(elbow, [Math.cos(angle - 0.48) * span * 0.96, height + 0.055,
            0.09 + Math.sin(angle - 0.48) * span * 0.96], 0.004, 0.001, side % 2 === 0);
          limb(elbow, [elbow[0] + Math.cos(angle - 0.7) * 0.06, elbow[1] + 0.065,
            elbow[2] + Math.sin(angle - 0.7) * 0.06], 0.004, 0.001, false);
        }
      }
      [0.08, 0.86, 1.65, 2.55, 3.7].forEach((angle, i) => root(angle, 0.165 + (i % 3) * 0.018, 0.64));
      branch([0.08, 0.022, 0.29], [0.26, 0.015, 0.32], 0.011, 0.005, bark);
      branch([0.12, 0.028, 0.3], [0.21, 0.023, 0.315], 0.007, 0.005, purple);
      branch([0.19, 0.017, 0.31], [0.24, 0.008, 0.4], 0.005, 0.001, bark);
      splinter(0.18, 0.28, 0.037, 0.012, 1.1);
      splinter(-0.13, 0.37, 0.025, 0.01, 2.2, true);
    } else if (concept === "rootbed") {
      // A ground-level discovery: living forest above an exposed network
      // of mineralized roots. Every main run begins at a living tree base.
      // Each root is narrower than those trees' native trunks.
      const r = trunkRadius;
      type RootRun = { readonly points: readonly Point[]; readonly radius: number; readonly seed: number };
      const runs: readonly RootRun[] = [
        { points: [[-0.32, -0.003, 0.15], [-0.22, -0.002, 0.17], [-0.1, -0.004, 0.23],
          [0.065, -0.012, 0.26], [0.2, -0.014, 0.285]], radius: r * 0.3, seed: 7 },
        { points: [[0.28, -0.004, 0.28], [0.19, -0.002, 0.19], [0.08, -0.004, 0.12],
          [-0.02, -0.006, 0.065], [-0.075, -0.014, -0.065]], radius: r * 0.23, seed: 16 },
        { points: [[-0.32, -0.005, 0.15], [-0.21, -0.003, 0.28], [-0.11, -0.009, 0.34],
          [0.035, -0.014, 0.35]], radius: r * 0.18, seed: 22 },
        { points: [[0.34, -0.003, -0.045], [0.26, -0.002, 0.025], [0.19, -0.008, 0.105],
          [0.16, -0.014, 0.18]], radius: r * 0.25, seed: 5 },
        { points: [[-0.09, -0.004, -0.19], [-0.12, -0.003, -0.065], [-0.075, -0.005, 0.04],
          [-0.12, -0.013, 0.14]], radius: r * 0.24, seed: 10 },
        { points: [[-0.32, -0.004, 0.15], [-0.24, -0.003, 0.075], [-0.13, -0.005, 0.055],
          [-0.025, -0.014, 0.1]], radius: r * 0.2, seed: 12 },
        { points: [[0.28, -0.004, 0.28], [0.22, -0.003, 0.34], [0.1, -0.005, 0.38],
          [-0.005, -0.014, 0.4]], radius: r * 0.22, seed: 19 },
        { points: [[0.34, -0.004, -0.045], [0.2, -0.003, -0.015], [0.105, -0.005, 0.015],
          [0.02, -0.013, -0.025]], radius: r * 0.2, seed: 24 },
        // Smaller daughter roots branch from the exposed parent runs.
        { points: [[-0.22, -0.002, 0.17], [-0.16, -0.004, 0.135], [-0.065, -0.013, 0.16]],
          radius: r * 0.14, seed: 4 },
        { points: [[-0.1, -0.004, 0.23], [-0.055, -0.004, 0.29], [0.045, -0.013, 0.32]],
          radius: r * 0.13, seed: 8 },
        { points: [[0.19, -0.002, 0.19], [0.12, -0.004, 0.215], [0.025, -0.013, 0.195]],
          radius: r * 0.15, seed: 14 },
        { points: [[-0.12, -0.003, -0.065], [-0.2, -0.004, -0.025], [-0.23, -0.013, 0.045]],
          radius: r * 0.13, seed: 26 }
      ];
      runs.forEach((run) => {
        timber({ points: run.points, baseRadius: run.radius, tipRadius: 0.0007, taperPower: 1.55,
          opening: [0, 1, 0.3], gap: 1.8, seed: run.seed, cracks: true, crackPhase: -1 + (run.seed % 3) * 0.3 }, true);
      });
      // Rootlets fork close to their parent run and disappear under the soil.
      // The tile surface is y=-.0085; negative centers embed the root bodies.
      branch([-0.22, -0.005, 0.17], [-0.24, -0.014, 0.07], 0.0025, 0.0004, bark);
      branch([-0.14, -0.007, 0.32], [-0.16, -0.014, 0.405], 0.0018, 0.0003, darkBark);
      branch([0.11, -0.007, 0.145], [0.015, -0.014, 0.19], 0.002, 0.0003, bark);
      branch([0.23, -0.006, 0.06], [0.285, -0.014, 0.12], 0.0022, 0.0004, darkBark);
    } else {
      const r = trunkRadius;
      // A rooted stump and a detached stem tell one clear tree-fall story.
      // Keep daylight between the break and log, away from living trunks.
      timber({
        points: [[-0.21, 0.005, 0.16], [-0.215, 0.065, 0.16], [-0.22, 0.125, 0.165]],
        baseRadius: r * 1.12, tipRadius: r * 0.83, opening: [0.15, 0.5, 1], gap: 0.8, seed: 24
      }, true);
      // Mineral fibres protrude through the jagged stump, still held by bark.
      branch([-0.22, 0.07, 0.17], [-0.224, 0.14, 0.174], r * 0.48, r * 0.25, purple);
      branch([-0.204, 0.08, 0.178], [-0.195, 0.135, 0.195], r * 0.22, 0.002, purpleLight);
      for (let i = 0; i < 4; i += 1) {
        const angle = i * Math.PI / 2 + 0.3;
        branch([-0.21, 0.023, 0.16], [-0.21 + Math.cos(angle) * 0.07,
          0.005, 0.16 + Math.sin(angle) * 0.07], r * 0.4, 0.002, darkBark);
      }
      timber({
        points: [[-0.105, r, 0.235], [-0.015, r * 1.2, 0.25], [0.12, r, 0.28],
          [0.24, r * 0.65, 0.32], [0.32, 0.008, 0.36]],
        baseRadius: r * 0.95, tipRadius: r * 0.18, opening: [0, 1, 0.3], gap: 1.4, seed: 17, cracks: true
      }, true);
      // Attached crown limbs retain bark all the way through their forks.
      // Mineral only appears where bark has broken, never as purple roots
      // sprouting out of a flat exposed face.
      branch([0.09, 0.025, 0.273], [0.145, 0.02, 0.365], r * 0.4, 0.006, bark);
      branch([0.145, 0.02, 0.365], [0.25, 0.009, 0.42], 0.006, 0.002, bark);
      branch([0.15, 0.02, 0.37], [0.105, 0.009, 0.435], 0.004, 0.001, bark);
      branch([0.21, 0.014, 0.4], [0.285, 0.008, 0.395], 0.003, 0.0007, bark);
      branch([0.04, 0.025, 0.262], [0.12, 0.028, 0.185], r * 0.35, 0.006, darkBark);
      branch([0.12, 0.028, 0.185], [0.22, 0.009, 0.145], 0.006, 0.002, bark);
      branch([0.13, 0.025, 0.18], [0.12, 0.01, 0.12], 0.003, 0.0007, bark);
      branch([0.25, 0.016, 0.325], [0.36, 0.008, 0.28], 0.004, 0.0008, bark);
      // Short fibres and chips connect the two matching breaks visually.
      branch([-0.11, 0.032, 0.238], [-0.125, 0.025, 0.222], 0.005, 0.001, wood);
      splinter(-0.16, 0.225, 0.025, 0.009, 0.7, true);
      splinter(-0.19, 0.26, 0.019, 0.006, 1.1);

    }
  }
  return {
    group,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      surfaces.dispose();
    }
  };
};

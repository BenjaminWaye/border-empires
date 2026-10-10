// River mountain cascades (docs/river-mountains-plan.md, PR C): water falls
// from the cleft in a river mountain's face (client-map-3d-mountain-massif.ts),
// down the peak and rock base, then runs along the one tile edge from the
// mountain's corner to the river's spring pool (client-map-3d-rivers-channel.ts
// SPRING_HALF_WIDTH). Foam on the steep part, river water lower down, with
// streaks scrolling downstream; a splash ring where it lands and a few
// boulders round the pool. Built alongside the river overlay
// (client-map-3d-water-wiring.ts) and animated from the ocean's frame tick.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Scene
} from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { heightfieldTileWindow, isInHeightfieldTileWindow } from "../client-map-3d-heightfield/client-map-3d-heightfield-window.js";
import { CLEFT_FROM, riverFacePeakRho, riverFaceProfileY } from "../client-map-3d-mountain-massif.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { mountainNeighbourhoodAt, mountainVariationAt, type MountainNeighbourhoodLookup } from "../client-map-mountain-variation/client-map-mountain-variation.js";
import { riverMountainFaces, type RiverMountainFace } from "../client-map-river-mountains/client-map-river-mountains.js";
import { heightfieldSurfaceY, RIVER_WATER_DEPTH, riverTrenchDepth, SPRING_HALF_WIDTH } from "./client-map-3d-rivers-channel.js";
import { RIVER_WATER_CORE, RIVER_WATER_SHALLOW } from "./client-map-3d-river-water-material.js";

// Same lift client-map-3d.ts gives a mountain's massif over its highest corner
// (OVERLAY_RISE_ABOVE_HEIGHTFIELD), so the cascade starts on the same rock.
const MASSIF_RISE = 0.012;
const SURFACE_LIFT = 0.014;
// Where on the peak face (fraction of its height) the water leaves the
// cleft: just inside its lower end.
const SOURCE_FRACTION = CLEFT_FROM + 0.03;
const FACE_STEP = 0.035;
const EDGE_STEPS = 12;
const TOP_HALF_WIDTH = 0.03;
const BOTTOM_HALF_WIDTH = 0.045;
// Steeper than this (rise over run) reads as falling water: foam colour.
const FALL_SLOPE = 0.6;
const FOAM: readonly [number, number, number, number] = [0.86, 0.93, 0.97, 0.95];
const SPLASH_RADII: readonly [number, number] = [0.05, 0.15];
const SPLASH_SEGMENTS = 16;
const BOULDER_RADIUS = 0.045;
// [upstream of the pool's centre, across the stream] -- clear of the water.
const BOULDER_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0.17, 0.1],
  [0.2, -0.11],
  [0.06, 0.19]
];

export type RiverCascadeDeps = {
  readonly heightfield: {
    readonly cornerYAt: (cornerX: number, cornerZ: number) => number;
    readonly elevationAt: (wx: number, wy: number) => number;
  };
  /** The massif's own neighbourhood lookup, so the cascade follows the peak actually drawn. */
  readonly mountainLookup: MountainNeighbourhoodLookup;
};

export type RiverCascadeRebuildInputs = {
  readonly camX: number;
  readonly camY: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly isExploredAt: (wx: number, wy: number) => boolean;
};

export type RiverCascades = {
  readonly rebuild: (inputs: RiverCascadeRebuildInputs) => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

/** One cascade sample: scene position, half-width, RGBA, distance downstream. */
export type CascadeSample = { x: number; y: number; z: number; halfWidth: number; color: readonly [number, number, number, number]; flow: number };

/** The two tiles either side of a cascade's edge (exit corner to head corner). */
export const cascadeSideTiles = (face: RiverMountainFace): ReadonlyArray<readonly [number, number]> => {
  const { exit, head } = face;
  if (exit.x === head.x) {
    const north = toroidDelta(exit.y, head.y, WORLD_HEIGHT) > 0 ? exit.y : head.y;
    return [[head.x - 1, north], [head.x, north]];
  }
  const west = toroidDelta(exit.x, head.x, WORLD_WIDTH) > 0 ? exit.x : head.x;
  return [[west, head.y - 1], [west, head.y]];
};

const wrapW = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
const wrapH = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

/**
 * The cascade's centreline for one river mountain, in scene coords relative
 * to (camX, camY): down the face from the cleft, then along the edge from
 * the mountain's exit corner into the pool at the head, ending at the pool's
 * water level.
 */
export const cascadeCenterline = (
  face: RiverMountainFace,
  camX: number,
  camY: number,
  deps: RiverCascadeDeps
): CascadeSample[] => {
  const { heightfield } = deps;
  const { wrapX, wrapY } = deps.mountainLookup;
  const mx = face.mountain.x;
  const my = face.mountain.y;
  const variation = mountainVariationAt(mx, my, mountainNeighbourhoodAt(mx, my, deps.mountainLookup));
  const massifY =
    Math.max(
      heightfield.elevationAt(mx, my),
      heightfield.cornerYAt(mx, my),
      heightfield.cornerYAt(wrapX(mx + 1), my),
      heightfield.cornerYAt(mx, wrapY(my + 1)),
      heightfield.cornerYAt(wrapX(mx + 1), wrapY(my + 1))
    ) + MASSIF_RISE;
  const centreX = toroidDelta(camX, mx, WORLD_WIDTH) + 0.5;
  const centreZ = toroidDelta(camY, my, WORLD_HEIGHT) + 0.5;
  const headX = toroidDelta(camX, face.head.x, WORLD_WIDTH);
  const headZ = toroidDelta(camY, face.head.y, WORLD_HEIGHT);
  const exitX = toroidDelta(camX, face.exit.x, WORLD_WIDTH);
  const exitZ = toroidDelta(camY, face.exit.y, WORLD_HEIGHT);
  const groundAt = (x: number, z: number): number => heightfieldSurfaceY(x, z, camX, camY, heightfield.cornerYAt);
  const poolY = groundAt(headX, headZ) - RIVER_WATER_DEPTH;
  // Ground (carved into the pool's bowl near the head) or the massif's rock, whichever is higher.
  const surfaceAt = (x: number, z: number): number => {
    const rock = massifY + riverFaceProfileY(Math.hypot(x - centreX, z - centreZ), variation.heightScale, variation.footprintScale);
    const toHead = Math.hypot(x - headX, z - headZ);
    const ground = Math.max(groundAt(x, z) - riverTrenchDepth(toHead, SPRING_HALF_WIDTH), poolY);
    return Math.max(rock, ground) + SURFACE_LIFT;
  };

  const points: { x: number; z: number; y: number }[] = [];
  const startRho = riverFacePeakRho(SOURCE_FRACTION, variation.footprintScale);
  const exitRho = Math.hypot(exitX - centreX, exitZ - centreZ);
  for (let rho = startRho; rho < exitRho; rho += FACE_STEP) {
    const x = centreX + face.dirX * rho;
    const z = centreZ + face.dirY * rho;
    points.push({ x, z, y: surfaceAt(x, z) });
  }
  for (let s = 0; s <= EDGE_STEPS; s += 1) {
    const t = s / EDGE_STEPS;
    const x = exitX + (headX - exitX) * t;
    const z = exitZ + (headZ - exitZ) * t;
    points.push({ x, z, y: s === EDGE_STEPS ? poolY + SURFACE_LIFT : surfaceAt(x, z) });
  }

  const samples: CascadeSample[] = [];
  let flow = 0;
  points.forEach((p, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const run = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
    const slope = (prev.y - next.y) / run;
    if (i > 0) flow += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
    const t = i / Math.max(1, points.length - 1);
    const foam = Math.min(1, Math.max(0, slope / FALL_SLOPE));
    const water = t > 0.85 ? RIVER_WATER_CORE : RIVER_WATER_SHALLOW;
    const color: [number, number, number, number] = [0, 1, 2, 3].map((k) => water[k]! + (FOAM[k]! - water[k]!) * foam) as [number, number, number, number];
    samples.push({ ...p, halfWidth: TOP_HALF_WIDTH + (BOTTOM_HALF_WIDTH - TOP_HALF_WIDTH) * t, color, flow });
  });
  return samples;
};

type Buffers = { positions: number[]; colors: number[]; flows: number[]; indices: number[] };

const appendRibbon = (buffers: Buffers, samples: readonly CascadeSample[]): void => {
  const base = buffers.positions.length / 3;
  samples.forEach((p, i) => {
    const prev = samples[Math.max(0, i - 1)]!;
    const next = samples[Math.min(samples.length - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const tlen = Math.hypot(tx, tz) || 1;
    const nx = (-tz / tlen) * p.halfWidth;
    const nz = (tx / tlen) * p.halfWidth;
    for (const side of [-1, 1]) {
      buffers.positions.push(p.x + nx * side, p.y, p.z + nz * side);
      buffers.colors.push(...p.color);
      buffers.flows.push(p.flow);
    }
  });
  for (let i = 0; i + 1 < samples.length; i += 1) {
    const a = base + i * 2;
    buffers.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
};

const appendSplash = (buffers: Buffers, x: number, y: number, z: number): void => {
  const base = buffers.positions.length / 3;
  const [inner, outer] = SPLASH_RADII;
  for (let k = 0; k < SPLASH_SEGMENTS; k += 1) {
    const a = (k / SPLASH_SEGMENTS) * Math.PI * 2;
    for (const [r, alpha] of [[inner, 0.75], [outer, 0]] as const) {
      buffers.positions.push(x + Math.cos(a) * r, y + 0.004, z + Math.sin(a) * r);
      buffers.colors.push(FOAM[0], FOAM[1], FOAM[2], alpha);
      buffers.flows.push(0);
    }
  }
  for (let k = 0; k < SPLASH_SEGMENTS; k += 1) {
    const a = base + k * 2;
    const b = base + ((k + 1) % SPLASH_SEGMENTS) * 2;
    buffers.indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
};

/**
 * River water with streaks scrolling downstream: the `flow` attribute is the
 * distance along the cascade; uTime moves the streaks.
 */
const createCascadeMaterial = (time: { value: number }): MeshStandardMaterial => {
  const material = new MeshStandardMaterial({
    color: new Color(1, 1, 1),
    vertexColors: true,
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: DoubleSide
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float flow;\nvarying float vFlow;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlow = flow;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying float vFlow;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\nfloat streak = smoothstep(0.6, 1.0, fract(vFlow * 9.0 - uTime * 1.8));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), streak * 0.4);"
      );
  };
  material.customProgramCacheKey = () => "river-cascade";
  return material;
};

export const createRiverCascades = (scene: Scene, deps: RiverCascadeDeps): RiverCascades => {
  const time = { value: 0 };
  const material = createCascadeMaterial(time);
  const boulderGeometry = new DodecahedronGeometry(BOULDER_RADIUS, 0);
  const boulderMaterial = new MeshStandardMaterial({ color: "#6f6b6e", roughness: 0.95, metalness: 0, flatShading: true });
  let mesh: Mesh | null = null;
  let boulders: InstancedMesh | null = null;
  const matrix = new Matrix4();

  const clear = (): void => {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh = null;
    }
    if (boulders) {
      scene.remove(boulders);
      boulders.dispose();
      boulders = null;
    }
  };

  const rebuild = (inputs: RiverCascadeRebuildInputs): void => {
    clear();
    const { camX, camY, isExploredAt } = inputs;
    const window = heightfieldTileWindow(inputs.halfW, inputs.halfH);
    const visible = (wx: number, wy: number): boolean =>
      isInHeightfieldTileWindow(window, toroidDelta(camX, wx, WORLD_WIDTH), toroidDelta(camY, wy, WORLD_HEIGHT)) && isExploredAt(wrapW(wx), wrapH(wy));
    const buffers: Buffers = { positions: [], colors: [], flows: [], indices: [] };
    const stones: { x: number; y: number; z: number }[] = [];
    for (const face of riverMountainFaces().values()) {
      if (!deps.mountainLookup.isMountainAt(face.mountain.x, face.mountain.y)) continue;
      // The mountain and both tiles beside the cascade's edge must be drawn.
      if (!visible(face.mountain.x, face.mountain.y) || !cascadeSideTiles(face).every(([x, y]) => visible(x, y))) continue;
      const samples = cascadeCenterline(face, camX, camY, deps);
      if (samples.length < 2) continue;
      appendRibbon(buffers, samples);
      const end = samples[samples.length - 1]!;
      appendSplash(buffers, end.x, end.y, end.z);
      // Boulders on the bank either side of where the cascade enters the pool.
      const back = samples[Math.max(0, samples.length - 4)]!;
      const len = Math.hypot(back.x - end.x, back.z - end.z) || 1;
      const ux = (back.x - end.x) / len;
      const uz = (back.z - end.z) / len;
      for (const [along, across] of BOULDER_OFFSETS) {
        stones.push({ x: end.x + ux * along - uz * across, y: back.y - BOULDER_RADIUS * 0.3, z: end.z + uz * along + ux * across });
      }
    }
    if (buffers.positions.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(buffers.positions), 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(buffers.colors), 4));
    geometry.setAttribute("flow", new BufferAttribute(new Float32Array(buffers.flows), 1));
    geometry.setIndex(buffers.indices);
    geometry.computeVertexNormals();
    mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = RENDER_ORDER.riverWater;
    scene.add(mesh);
    boulders = new InstancedMesh(boulderGeometry, boulderMaterial, stones.length);
    boulders.frustumCulled = false;
    boulders.castShadow = true;
    boulders.receiveShadow = true;
    stones.forEach((s, i) => boulders!.setMatrixAt(i, matrix.makeTranslation(s.x, s.y, s.z)));
    boulders.instanceMatrix.needsUpdate = true;
    scene.add(boulders);
  };

  const tick = (nowMs: number): void => {
    time.value = (nowMs / 1000) % 1000;
  };

  const dispose = (): void => {
    clear();
    material.dispose();
    boulderGeometry.dispose();
    boulderMaterial.dispose();
  };

  return { rebuild, tick, dispose };
};

// River mountain springs (docs/rivers-remake-plan.md, "River mountains"): the river
// wells up at the base of its mountain's drawn model (client-map-3d-mountain-
// massif.ts, client-map-3d-mountain-models.ts) on the side facing the river
// head, between two boulders, and meanders over the ground into the spring
// pool (client-map-3d-rivers-channel.ts SPRING_HALF_WIDTH) in a channel with
// earth banks (client-map-3d-river-cascade-banks.ts). White water where it
// wells up, river water after, with ripples moving downstream; a splash ring
// and a few boulders at the pool. Built alongside the river overlay
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
import { mountainPlacementAt } from "../client-map-3d-mountain-massif.js";
import { MOUNTAIN_MODELS, mountainModelHeight } from "../client-map-3d-mountain-models.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { type MountainNeighbourhoodLookup } from "../client-map-mountain-variation/client-map-mountain-variation.js";
import { riverMountainFaces, type RiverMountainFace } from "../client-map-river-mountains/client-map-river-mountains.js";
import { cascadeRoute } from "../client-map-river-mountains/client-map-river-cascade-route.js";
import {
  appendCascadeBanks,
  cascadeBankAt,
  createCascadeBankGeometry,
  createCascadeBankMaterial,
  type CascadeBankSide
} from "./client-map-3d-river-cascade-banks.js";
import { heightfieldSurfaceY, RIVER_WATER_DEPTH, riverTrenchDepth, SPRING_HALF_WIDTH } from "./client-map-3d-rivers-channel.js";
import { RIVER_WATER_CORE, RIVER_WATER_SHALLOW } from "./client-map-3d-river-water-material.js";

// Same lift client-map-3d.ts gives a mountain's massif over its highest corner
// (OVERLAY_RISE_ABOVE_HEIGHTFIELD), so the cascade starts on the same rock.
const MASSIF_RISE = 0.012;
const SURFACE_LIFT = 0.014;
// The spring: found walking out from the mountain tile's centre toward the
// pool in these steps, where the drawn rock meets the ground (the rock's
// base), then nudged this far clear of it.
const SOURCE_STEP = 0.02;
const SOURCE_MAX_RHO = 1.2;
const GROUND_REACHED = 0.012;
const SOURCE_CLEAR = 0.03;
// The stream bows sideways by this fraction of its length, so it meanders
// rather than running ruler-straight to the pool.
const MEANDER = 0.14;
const STREAM_STEPS = 20;
// Where it wells up from the rock it's white water, settling over this fraction of its length.
const SPRING_FOAM = 0.5;
const SPRING_FOAM_FADE = 0.25;
const TOP_HALF_WIDTH = 0.065;
const BOTTOM_HALF_WIDTH = 0.095;
// A ribbon edge rises with the ground across the flow by at most this much (tiles).
const EDGE_RISE = 0.06;
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
// [downstream of the spring, across the stream] -- either side of where it wells up.
const SPRING_BOULDER_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-0.01, 0.1],
  [0.03, -0.11]
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
export type CascadeSample = {
  x: number;
  y: number;
  z: number;
  halfWidth: number;
  color: readonly [number, number, number, number];
  flow: number;
  /** Heights of the ribbon's two edges (left, right of the flow): on a cross-slope they follow the ground, so no half of it sinks in. */
  edgeY: readonly [number, number];
  /** The channel's banks either side (client-map-3d-river-cascade-banks.ts). */
  bank: readonly [CascadeBankSide, CascadeBankSide];
};

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
 * The stream's centreline for one river mountain, in scene coords relative
 * to (camX, camY): from the spring at the drawn mountain's base, meandering
 * over the ground into the pool at the head, ending at the pool's water level.
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
  // The model drawn on the river mountain's tile, and how it's turned and scaled.
  const placement = mountainPlacementAt(mx, my, deps.mountainLookup);
  const model = MOUNTAIN_MODELS[placement.modelIndex]!;
  const cos = Math.cos(placement.yaw);
  const sin = Math.sin(placement.yaw);
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
  const groundAt = (x: number, z: number): number => heightfieldSurfaceY(x, z, camX, camY, heightfield.cornerYAt);
  const poolY = groundAt(headX, headZ) - RIVER_WATER_DEPTH;
  // The mountain's rock surface, and the ground (carved into the pool's bowl near the head).
  const rockAt = (x: number, z: number): number => {
    // Scene offset from the tile centre -> the model's own (unturned, unscaled) frame.
    const dx = x - centreX;
    const dz = z - centreZ;
    const lx = (dx * cos - dz * sin) / placement.footprint;
    const lz = (dx * sin + dz * cos) / placement.footprint;
    return massifY + placement.heightScale * mountainModelHeight(model, lx, lz);
  };
  const groundAtStream = (x: number, z: number): number =>
    Math.max(groundAt(x, z) - riverTrenchDepth(Math.hypot(x - headX, z - headZ), SPRING_HALF_WIDTH), poolY);
  const surfaceAt = (x: number, z: number): number => Math.max(rockAt(x, z), groundAtStream(x, z)) + SURFACE_LIFT;

  // The river wells up at the mountain's base on the pool's side and
  // meanders over the ground into the pool (cascadeRoute).
  const route = cascadeRoute(face);
  const isRockAt = (x: number, z: number): boolean => rockAt(x, z) > groundAtStream(x, z) + GROUND_REACHED;
  let rho = 0;
  while (rho < SOURCE_MAX_RHO && isRockAt(centreX + route.dirX * rho, centreZ + route.dirY * rho)) rho += SOURCE_STEP;
  rho += SOURCE_CLEAR;
  const sourceX = centreX + route.dirX * rho;
  const sourceZ = centreZ + route.dirY * rho;
  // A quadratic curve bowed to one side (fixed per mountain).
  const length = Math.hypot(headX - sourceX, headZ - sourceZ);
  const bow = (route.bowLeft ? 1 : -1) * MEANDER * length;
  const ctrlX = (sourceX + headX) / 2 - route.dirY * bow;
  const ctrlZ = (sourceZ + headZ) / 2 + route.dirX * bow;
  const points: { x: number; z: number; y: number }[] = [];
  for (let s = 0; s <= STREAM_STEPS; s += 1) {
    const t = s / STREAM_STEPS;
    const u = 1 - t;
    const x = u * u * sourceX + 2 * u * t * ctrlX + t * t * headX;
    const z = u * u * sourceZ + 2 * u * t * ctrlZ + t * t * headZ;
    points.push({ x, z, y: s === STREAM_STEPS ? poolY + SURFACE_LIFT : surfaceAt(x, z) });
  }
  // Water never runs uphill: where terraces or jitter rise ahead, it keeps its level.
  for (let i = 1; i < points.length; i += 1) points[i]!.y = Math.min(points[i]!.y, points[i - 1]!.y);

  const samples: CascadeSample[] = [];
  let flow = 0;
  points.forEach((p, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    if (i > 0) flow += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
    const t = i / Math.max(1, points.length - 1);
    // White water where it wells up from the rock, settling into river.
    const foam = SPRING_FOAM * Math.max(0, 1 - t / SPRING_FOAM_FADE);
    const water = t > 0.85 ? RIVER_WATER_CORE : RIVER_WATER_SHALLOW;
    const color: [number, number, number, number] = [0, 1, 2, 3].map((k) => water[k]! + (FOAM[k]! - water[k]!) * foam) as [number, number, number, number];
    const halfWidth = TOP_HALF_WIDTH + (BOTTOM_HALF_WIDTH - TOP_HALF_WIDTH) * t;
    // Edge heights across the flow (same normal as appendRibbon); level water at the pool.
    const tlen = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
    const ex = (-(next.z - prev.z) / tlen) * halfWidth;
    const ez = ((next.x - prev.x) / tlen) * halfWidth;
    const edge = (side: number): number => (i === points.length - 1 ? p.y : Math.max(p.y, Math.min(p.y + EDGE_RISE, surfaceAt(p.x + ex * side, p.z + ez * side))));
    const edgeY = [edge(-1), edge(1)] as const;
    const bank = cascadeBankAt({ x: p.x, z: p.z, nx: ex / halfWidth, nz: ez / halfWidth, halfWidth, edgeY, t, surfaceAt, isRockAt });
    samples.push({ x: p.x, y: p.y, z: p.z, halfWidth, color, flow, edgeY, bank });
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
    for (const [k, side] of [-1, 1].entries()) {
      buffers.positions.push(p.x + nx * side, p.edgeY[k]!, p.z + nz * side);
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
        "#include <color_fragment>\nfloat ripple = sin(vFlow * 23.0 - uTime * 4.0) * 0.5 + sin(vFlow * 41.0 - uTime * 6.3 + 1.7) * 0.35 + sin(vFlow * 9.0 - uTime * 2.1) * 0.15;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), smoothstep(0.55, 1.0, ripple) * 0.18);"
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
  let banks: Mesh | null = null;
  const bankMaterial = createCascadeBankMaterial();
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
    if (banks) {
      scene.remove(banks);
      banks.geometry.dispose();
      banks = null;
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
    const bankBuffers = { positions: [] as number[], colors: [] as number[] };
    for (const face of riverMountainFaces().values()) {
      if (!deps.mountainLookup.isMountainAt(face.mountain.x, face.mountain.y)) continue;
      // The mountain and both tiles beside the cascade's edge must be drawn.
      if (!visible(face.mountain.x, face.mountain.y) || !cascadeSideTiles(face).every(([x, y]) => visible(x, y))) continue;
      const samples = cascadeCenterline(face, camX, camY, deps);
      if (samples.length < 2) continue;
      appendRibbon(buffers, samples);
      appendCascadeBanks(bankBuffers, samples);
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
      // ...and either side of the spring, where it wells up at the mountain's base.
      const start = samples[0]!;
      const ahead = samples[Math.min(samples.length - 1, 2)]!;
      const sl = Math.hypot(ahead.x - start.x, ahead.z - start.z) || 1;
      const sx = (ahead.x - start.x) / sl;
      const sz = (ahead.z - start.z) / sl;
      for (const [along, across] of SPRING_BOULDER_OFFSETS) {
        stones.push({ x: start.x + sx * along - sz * across, y: start.y - BOULDER_RADIUS * 0.3, z: start.z + sz * along + sx * across });
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
    banks = new Mesh(createCascadeBankGeometry(bankBuffers), bankMaterial);
    banks.frustumCulled = false;
    banks.receiveShadow = true;
    scene.add(banks);
  };

  const tick = (nowMs: number): void => {
    time.value = (nowMs / 1000) % 1000;
  };

  const dispose = (): void => {
    clear();
    material.dispose();
    boulderGeometry.dispose();
    boulderMaterial.dispose();
    bankMaterial.dispose();
  };

  return { rebuild, tick, dispose };
};

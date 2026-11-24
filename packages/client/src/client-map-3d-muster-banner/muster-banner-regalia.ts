// The High-noble standard's regalia on the true-3D map: draws the gilded
// extras (muster-banner-regalia-geometry.ts) on every muster flag whose owner
// shows that cosmetic, on top of the unchanged standard banner. Kept apart
// from client-map-3d-muster-overlay.ts so that file holds only what every
// flag has. Most flags carry no regalia, so everything here is sized by the
// number of High-noble flags and costs nothing when there are none.
import {
  type Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  Object3D,
  PlaneGeometry,
  type Scene,
  type Texture
} from "three";
import {
  AUREOLE_Y,
  AUREOLE_Z,
  getMusterBannerRegaliaGeometry,
  REGALIA_SPARKLE_POINTS
} from "./muster-banner-regalia-geometry.js";
import { createRegaliaMaterials } from "./muster-banner-regalia-materials.js";

/** One High-noble flag: where its banner stands, its owner's colour, and a 0..1 seed so flags don't move in step. */
export type RegaliaFlag = { x: number; y: number; z: number; tint: Color; seed: number };

export type MusterBannerRegalia = {
  /** Replaces the set of flags that carry regalia. */
  readonly commit: (flags: readonly RegaliaFlag[]) => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

/** The aureole turns once in this long; the halo counter-turns a little faster. */
const AUREOLE_TURN_MS = 40_000;
const HALO_TURN_MS = 26_000;
const SPARKLES = REGALIA_SPARKLE_POINTS.length;

export const createMusterBannerRegalia = (scene: Scene, max: number, envMap?: Texture, depthMaterial?: Material): MusterBannerRegalia => {
  const geometry = getMusterBannerRegaliaGeometry();
  const materials = createRegaliaMaterials(envMap);

  const gold = new InstancedMesh(geometry.gold, materials.gold, max);
  const gems = new InstancedMesh(geometry.tinted, materials.gem, max);
  gems.instanceMatrix = gold.instanceMatrix;
  // Its own copy: the per-flag phase attribute must not be shared between overlays.
  const streamerGeometry = geometry.streamers.clone();
  const streamerPhase = new InstancedBufferAttribute(new Float32Array(max), 1);
  streamerGeometry.setAttribute("aStreamerPhase", streamerPhase);
  const streamers = new InstancedMesh(streamerGeometry, materials.streamer, max);
  streamers.instanceMatrix = gold.instanceMatrix;
  const aureole = new InstancedMesh(geometry.aureole, materials.gold, max);
  const halo = new InstancedMesh(geometry.halo, materials.gold, max);
  aureole.instanceMatrix.setUsage(DynamicDrawUsage);
  halo.instanceMatrix.setUsage(DynamicDrawUsage);
  const sparkleGeometry = new PlaneGeometry(1, 1);
  const sparklePhase = new InstancedBufferAttribute(new Float32Array(max * SPARKLES), 1);
  sparkleGeometry.setAttribute("aSparklePhase", sparklePhase);
  const sparkles = new InstancedMesh(sparkleGeometry, materials.sparkle, max * SPARKLES);
  sparkles.renderOrder = 37; // over the flag it glints on

  const solid = [gold, gems, streamers, aureole, halo];
  const names = ["gold", "enamel", "streamers", "aureole", "halo"];
  for (const [i, mesh] of solid.entries()) {
    mesh.name = `muster-banner-regalia-${names[i]}`;
    if (depthMaterial && mesh !== streamers) mesh.customDepthMaterial = depthMaterial;
    mesh.castShadow = mesh !== streamers; // the ribbons move in their shader; a static shadow would lie
    mesh.receiveShadow = true;
  }
  sparkles.name = "muster-banner-regalia-sparkles";
  const meshes = [...solid, sparkles];
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  scene.add(...meshes);

  const flags: RegaliaFlag[] = [];
  const matrix = new Matrix4();
  const dummy = new Object3D();

  const commit = (next: readonly RegaliaFlag[]): void => {
    flags.length = 0;
    for (const flag of next) if (flags.length < max) flags.push(flag);
    for (const mesh of solid) mesh.count = flags.length;
    sparkles.count = flags.length * SPARKLES;
    if (flags.length === 0) return;
    for (const [i, flag] of flags.entries()) {
      gold.setMatrixAt(i, matrix.makeTranslation(flag.x, flag.y, flag.z));
      gems.setColorAt(i, flag.tint);
      streamers.setColorAt(i, flag.tint);
      streamerPhase.setX(i, flag.seed);
      for (const [k, point] of REGALIA_SPARKLE_POINTS.entries()) {
        sparkles.setMatrixAt(i * SPARKLES + k, matrix.makeTranslation(flag.x + point[0], flag.y + point[1], flag.z + point[2]));
        // 0..1, spread so neighbouring points never glint together.
        sparklePhase.setX(i * SPARKLES + k, (flag.seed * 7.31 + k * 0.618) % 1);
      }
    }
    gold.instanceMatrix.needsUpdate = true;
    sparkles.instanceMatrix.needsUpdate = true;
    streamerPhase.needsUpdate = true;
    sparklePhase.needsUpdate = true;
    for (const mesh of [gems, streamers]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  const spin = (mesh: InstancedMesh, i: number, flag: RegaliaFlag, turns: number): void => {
    dummy.position.set(flag.x, flag.y + AUREOLE_Y, flag.z + AUREOLE_Z);
    dummy.rotation.set(0, 0, (turns + flag.seed) * Math.PI * 2);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  const tick = (nowMs: number): void => {
    if (flags.length === 0) return;
    materials.tick(nowMs);
    const aureoleTurns = (nowMs % AUREOLE_TURN_MS) / AUREOLE_TURN_MS;
    const haloTurns = -(nowMs % HALO_TURN_MS) / HALO_TURN_MS;
    for (const [i, flag] of flags.entries()) {
      spin(aureole, i, flag, aureoleTurns);
      spin(halo, i, flag, haloTurns);
    }
    aureole.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(...meshes);
    for (const mesh of meshes) mesh.dispose();
    streamerGeometry.dispose();
    sparkleGeometry.dispose();
    materials.dispose();
  };

  return { commit, tick, dispose };
};

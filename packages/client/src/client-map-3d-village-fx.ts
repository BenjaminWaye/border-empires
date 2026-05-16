import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry
} from "three";

const MAX_SMOKE_VILLAGES = 1024;
const SMOKE_PUFFS_PER_VILLAGE = 4;
const MAX_SMOKE_PUFFS = MAX_SMOKE_VILLAGES * SMOKE_PUFFS_PER_VILLAGE;
const SMOKE_PUFF_RADIUS = 0.06;
const SMOKE_RISE_HEIGHT = 1.7;
const SMOKE_BASE_Y = 0.35;
// Slower cycle so each puff drifts upward at a calmer pace.
const SMOKE_CYCLE_MS = 8500;

// Three dark grey smoke columns for recently captured towns. Distinct mesh so
// the material/opacity can read as "burning / unstable" without affecting the
// pale owned-village puffs.
const MAX_CAPTURED_TOWNS = 512;
const CAPTURED_COLUMNS_PER_TOWN = 3;
const CAPTURED_PUFFS_PER_COLUMN = 6;
const CAPTURED_PUFFS_PER_TOWN = CAPTURED_COLUMNS_PER_TOWN * CAPTURED_PUFFS_PER_COLUMN;
const MAX_CAPTURED_PUFFS = MAX_CAPTURED_TOWNS * CAPTURED_PUFFS_PER_TOWN;
const CAPTURED_PUFF_RADIUS = 0.075;
const CAPTURED_RISE_HEIGHT = 2.6;
const CAPTURED_BASE_Y = 0.32;
const CAPTURED_CYCLE_MS = 6500;
const CAPTURED_COLUMN_RADIUS = 0.22;

const MAX_CAPITAL_BANNERS = 256;
const BANNER_POLE_HEIGHT = 1.55;
const BANNER_POLE_BASE_Y = 0.1;
const BANNER_PLANE_WIDTH = 1.05;
const BANNER_PLANE_HEIGHT = 0.62;
const BANNER_OFFSET_X = 0.32;
const BANNER_OFFSET_Y = 1.05;
const BANNER_FLUTTER_SEGMENTS_X = 6;
const BANNER_FLUTTER_SEGMENTS_Y = 3;

export type VillageEffects = {
  readonly smokeMesh: InstancedMesh;
  readonly bannerMesh: InstancedMesh;
  readonly poleMesh: InstancedMesh;
  readonly capturedSmokeMesh: InstancedMesh;
  readonly clear: () => void;
  readonly addOwnedVillage: (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    seed: number
  ) => void;
  readonly addCapturedTownSmoke: (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    seed: number
  ) => void;
  readonly addCapitalBanner: (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    color: string,
    seed: number
  ) => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
};

type SmokeRecord = {
  worldX: number;
  worldZ: number;
  surfaceY: number;
  seed: number;
};

type BannerRecord = {
  worldX: number;
  worldZ: number;
  surfaceY: number;
  seed: number;
};

export const createVillageEffects = (scene: Scene): VillageEffects => {
  const smokeGeometry = new SphereGeometry(SMOKE_PUFF_RADIUS, 8, 6);
  const smokeMaterial = new MeshBasicMaterial({
    color: "#d8d3c4",
    transparent: true,
    opacity: 0.32,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const smokeMesh = new InstancedMesh(smokeGeometry, smokeMaterial, MAX_SMOKE_PUFFS);
  smokeMesh.frustumCulled = false;
  smokeMesh.count = 0;

  // Captured-town smoke: darker, more opaque, no additive blend so columns
  // read as solid soot against the sky rather than the wispy pale puffs above.
  const capturedSmokeGeometry = new SphereGeometry(CAPTURED_PUFF_RADIUS, 8, 6);
  const capturedSmokeMaterial = new MeshBasicMaterial({
    color: "#3a3a3a",
    transparent: true,
    opacity: 0.7,
    depthWrite: false
  });
  const capturedSmokeMesh = new InstancedMesh(capturedSmokeGeometry, capturedSmokeMaterial, MAX_CAPTURED_PUFFS);
  capturedSmokeMesh.frustumCulled = false;
  capturedSmokeMesh.count = 0;

  const poleGeometry = new CylinderGeometry(0.025, 0.03, BANNER_POLE_HEIGHT, 5);
  const poleMaterial = new MeshStandardMaterial({
    color: "#3a2c20",
    roughness: 0.85,
    metalness: 0,
    flatShading: true
  });
  const poleMesh = new InstancedMesh(poleGeometry, poleMaterial, MAX_CAPITAL_BANNERS);
  poleMesh.frustumCulled = false;
  poleMesh.count = 0;

  const bannerGeometry = new PlaneGeometry(
    BANNER_PLANE_WIDTH,
    BANNER_PLANE_HEIGHT,
    BANNER_FLUTTER_SEGMENTS_X,
    BANNER_FLUTTER_SEGMENTS_Y
  );
  const bannerPositionAttr = bannerGeometry.attributes.position as BufferAttribute | undefined;
  let bannerBaseXY: Float32Array | undefined;
  if (bannerPositionAttr) {
    const arr = bannerPositionAttr.array as Float32Array;
    bannerBaseXY = new Float32Array(arr.length);
    bannerBaseXY.set(arr);
  }
  const bannerMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.78,
    metalness: 0,
    side: DoubleSide,
    flatShading: false
  });
  const bannerMesh = new InstancedMesh(bannerGeometry, bannerMaterial, MAX_CAPITAL_BANNERS);
  bannerMesh.frustumCulled = false;
  bannerMesh.count = 0;

  scene.add(poleMesh, bannerMesh, smokeMesh, capturedSmokeMesh);

  const villages: SmokeRecord[] = [];
  const capturedTowns: SmokeRecord[] = [];
  const banners: Array<BannerRecord & { color: Color }> = [];

  const tempMatrix = new Matrix4();
  const tempColor = new Color();

  const clear = (): void => {
    villages.length = 0;
    capturedTowns.length = 0;
    banners.length = 0;
  };

  const addOwnedVillage = (worldX: number, worldZ: number, surfaceY: number, seed: number): void => {
    if (villages.length >= MAX_SMOKE_VILLAGES) return;
    villages.push({ worldX, worldZ, surfaceY, seed });
  };

  const addCapturedTownSmoke = (worldX: number, worldZ: number, surfaceY: number, seed: number): void => {
    if (capturedTowns.length >= MAX_CAPTURED_TOWNS) return;
    capturedTowns.push({ worldX, worldZ, surfaceY, seed });
  };

  const addCapitalBanner = (
    worldX: number,
    worldZ: number,
    surfaceY: number,
    color: string,
    seed: number
  ): void => {
    if (banners.length >= MAX_CAPITAL_BANNERS) return;
    banners.push({ worldX, worldZ, surfaceY, seed, color: new Color(color) });
  };

  const commit = (): void => {
    let pole = 0;
    for (const b of banners) {
      tempMatrix.makeTranslation(
        b.worldX,
        b.surfaceY + BANNER_POLE_BASE_Y + BANNER_POLE_HEIGHT * 0.5,
        b.worldZ
      );
      poleMesh.setMatrixAt(pole, tempMatrix);
      pole += 1;
    }
    poleMesh.count = pole;
    poleMesh.instanceMatrix.needsUpdate = true;

    bannerMesh.count = banners.length;
    for (let i = 0; i < banners.length; i += 1) {
      bannerMesh.setColorAt(i, banners[i]!.color);
    }
    if (bannerMesh.instanceColor) bannerMesh.instanceColor.needsUpdate = true;
  };

  const update = (nowMs: number): void => {
    let puff = 0;
    for (const v of villages) {
      for (let i = 0; i < SMOKE_PUFFS_PER_VILLAGE; i += 1) {
        if (puff >= MAX_SMOKE_PUFFS) break;
        const phaseOffset = (v.seed * 73 + i * 1100) % SMOKE_CYCLE_MS;
        const phase = ((nowMs + phaseOffset) % SMOKE_CYCLE_MS) / SMOKE_CYCLE_MS;
        const rise = phase * SMOKE_RISE_HEIGHT;
        const drift = Math.sin(phase * Math.PI * 2 + v.seed) * 0.18 * phase;
        const driftZ = Math.cos(phase * Math.PI * 2 + v.seed * 1.7) * 0.12 * phase;
        const fade = 0.55 * (1 - phase) + 0.18;
        const scale = 0.6 + phase * 1.6;
        tempMatrix.makeScale(scale, scale, scale);
        tempMatrix.setPosition(
          v.worldX + drift,
          v.surfaceY + SMOKE_BASE_Y + rise,
          v.worldZ + driftZ
        );
        smokeMesh.setMatrixAt(puff, tempMatrix);
        tempColor.copy(smokeMaterial.color).multiplyScalar(fade);
        smokeMesh.setColorAt(puff, tempColor);
        puff += 1;
      }
    }
    smokeMesh.count = puff;
    smokeMesh.instanceMatrix.needsUpdate = true;
    if (smokeMesh.instanceColor) smokeMesh.instanceColor.needsUpdate = true;

    let capturedPuff = 0;
    for (const town of capturedTowns) {
      for (let col = 0; col < CAPTURED_COLUMNS_PER_TOWN; col += 1) {
        const columnAngle = (col / CAPTURED_COLUMNS_PER_TOWN) * Math.PI * 2 + town.seed * 0.13;
        const columnX = town.worldX + Math.cos(columnAngle) * CAPTURED_COLUMN_RADIUS;
        const columnZ = town.worldZ + Math.sin(columnAngle) * CAPTURED_COLUMN_RADIUS;
        for (let i = 0; i < CAPTURED_PUFFS_PER_COLUMN; i += 1) {
          if (capturedPuff >= MAX_CAPTURED_PUFFS) break;
          const phaseOffset = (town.seed * 53 + col * 1900 + i * 1100) % CAPTURED_CYCLE_MS;
          const phase = ((nowMs + phaseOffset) % CAPTURED_CYCLE_MS) / CAPTURED_CYCLE_MS;
          const rise = phase * CAPTURED_RISE_HEIGHT;
          const drift = Math.sin(phase * Math.PI * 2 + town.seed + col) * 0.12 * phase;
          const driftZ = Math.cos(phase * Math.PI * 2 + town.seed * 1.3 + col) * 0.10 * phase;
          const fade = 0.85 * (1 - phase * 0.7);
          const scale = 0.7 + phase * 1.4;
          tempMatrix.makeScale(scale, scale, scale);
          tempMatrix.setPosition(
            columnX + drift,
            town.surfaceY + CAPTURED_BASE_Y + rise,
            columnZ + driftZ
          );
          capturedSmokeMesh.setMatrixAt(capturedPuff, tempMatrix);
          tempColor.copy(capturedSmokeMaterial.color).multiplyScalar(fade);
          capturedSmokeMesh.setColorAt(capturedPuff, tempColor);
          capturedPuff += 1;
        }
      }
    }
    capturedSmokeMesh.count = capturedPuff;
    capturedSmokeMesh.instanceMatrix.needsUpdate = true;
    if (capturedSmokeMesh.instanceColor) capturedSmokeMesh.instanceColor.needsUpdate = true;

    if (bannerPositionAttr && bannerBaseXY) {
      const arr = bannerPositionAttr.array as Float32Array;
      const t = nowMs * 0.0028;
      for (let i = 0; i < arr.length; i += 3) {
        const baseX = bannerBaseXY[i] ?? 0;
        const baseY = bannerBaseXY[i + 1] ?? 0;
        const baseZ = bannerBaseXY[i + 2] ?? 0;
        const fluttering = (baseX + BANNER_PLANE_WIDTH / 2) / BANNER_PLANE_WIDTH;
        const wave = Math.sin(baseX * 4 + t) * 0.06 * fluttering;
        arr[i] = baseX;
        arr[i + 1] = baseY;
        arr[i + 2] = baseZ + wave;
      }
      bannerPositionAttr.needsUpdate = true;
    }

    for (let i = 0; i < banners.length; i += 1) {
      const b = banners[i]!;
      tempMatrix.makeTranslation(
        b.worldX + BANNER_OFFSET_X,
        b.surfaceY + BANNER_OFFSET_Y + BANNER_POLE_BASE_Y,
        b.worldZ
      );
      bannerMesh.setMatrixAt(i, tempMatrix);
    }
    bannerMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(poleMesh, bannerMesh, smokeMesh, capturedSmokeMesh);
    smokeGeometry.dispose();
    smokeMaterial.dispose();
    capturedSmokeGeometry.dispose();
    capturedSmokeMaterial.dispose();
    poleGeometry.dispose();
    poleMaterial.dispose();
    bannerGeometry.dispose();
    bannerMaterial.dispose();
  };

  return {
    smokeMesh,
    bannerMesh,
    poleMesh,
    capturedSmokeMesh,
    clear,
    addOwnedVillage,
    addCapturedTownSmoke,
    addCapitalBanner,
    commit,
    update,
    dispose
  };
};


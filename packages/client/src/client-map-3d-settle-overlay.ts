import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene
} from "three";

// Local wander helper. Replaces the shared `settlePixelWanderPoint` for
// the 3D path because the shared seed (in client-capture-effects.ts)
// XORs small wx/wy/salt products that dominate the high bits — the `i`
// term only flips low bits, so different settlers cluster within ~0.003
// of [0,1] and visually stack on a single pixel. The 2D loader hides
// this because each pixel-dot already snaps to integer coordinates;
// for 3D we need genuine spread per `i`. Using xmur3-style mixing.
const SETTLE_MOVE_MS = 1700;
const SETTLE_PAUSE_MS = 1000;
const SETTLE_CYCLE_MS = SETTLE_MOVE_MS + SETTLE_PAUSE_MS;

const wanderHash01 = (wx: number, wy: number, i: number, salt: number): number => {
  // Murmur3-style mixing. Each input is folded through a prime multiply
  // before combining, so a 1-bit change in any input propagates through
  // all 32 bits of the result. Prior implementation used small XORs of
  // small products, which left the i-term in the low bits only and
  // produced visually stacked dots.
  let h = Math.imul(wx | 0, 374761393);
  h = Math.imul(h + ((wy | 0) ^ 0x5bd1e995), -1640531535);
  h = Math.imul(h + (i | 0), -549389765);
  h = Math.imul(h + (salt | 0), 1597334677);
  h = Math.imul(h ^ (h >>> 16), -2048144789);
  h = Math.imul(h ^ (h >>> 13), -1028477387);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
};

const wanderPoint = (
  nowMs: number,
  wx: number,
  wy: number,
  i: number
): { x: number; y: number } => {
  const offsetMs = wanderHash01(wx, wy, i, 11) * SETTLE_CYCLE_MS;
  const localTime = nowMs + offsetMs;
  const segment = Math.floor(localTime / SETTLE_CYCLE_MS);
  const segmentTime = localTime - segment * SETTLE_CYCLE_MS;
  const fromX = wanderHash01(wx, wy, i, 41 + segment * 13);
  const fromY = wanderHash01(wx, wy, i, 83 + segment * 17);
  const toX = wanderHash01(wx, wy, i, 41 + (segment + 1) * 13);
  const toY = wanderHash01(wx, wy, i, 83 + (segment + 1) * 17);
  const t = segmentTime >= SETTLE_MOVE_MS ? 1 : segmentTime / SETTLE_MOVE_MS;
  return { x: fromX + (toX - fromX) * t, y: fromY + (toY - fromY) * t };
};

// 3D settle loader: when a tile is being settled, a swarm of small black
// "people" boxes wander on top of the tile, with the owner-color tint
// plate underneath and a pulsing yellow perimeter frame. Wander pattern
// matches the 2D loader (uses settlePixelWanderPoint), so the cadence of
// pause-then-walk is identical.

// Pinprick figures. Floor at ~0.022 width: anything smaller is sub-pixel
// at typical zoom and the whole swarm rasterises into one pixel — looks
// like a single static settler. Height stays taller than width so they
// read as standing figures, not flat dots.
const PEOPLE_PER_TILE = 18;
const PERSON_W = 0.022;
const PERSON_H = 0.05;
const PERSON_D = 0.022;
const PERSON_Y = PERSON_H * 0.5 + 0.005;
// Active people count grows with progress: PEOPLE_MIN at the start
// (enough that some are always mid-step while others pause), full
// PEOPLE_PER_TILE at completion. Linear ramp.
const PEOPLE_MIN = 2;
// Wander runs at wall-clock pace — calmer stroll. The 2D loader uses
// its own helper so this only affects the 3D settle dots.
const WANDER_TIME_SCALE = 1.0;

const TINT_SIZE = 0.94;
const TINT_Y = 0.014;
// Plate fills the tile west-to-east as `progress` goes 0→1, mirroring
// the 2D loader's left-to-right colour fill. West edge stays at
// sceneX - TINT_SIZE/2; east edge sweeps right with progress.
const TINT_HALF = TINT_SIZE * 0.5;

const FRAME_LENGTH = 0.92;
const FRAME_THICKNESS = 0.04;
const FRAME_HEIGHT = 0.012;
const FRAME_HALF = TINT_SIZE * 0.5 - FRAME_THICKNESS * 0.5;
const FRAME_Y = TINT_Y + 0.003;

type TileEntry = {
  readonly worldTileX: number;
  readonly worldTileY: number;
  readonly sceneX: number;
  readonly sceneZ: number;
  readonly surfaceY: number;
  readonly startAt: number; // ms
  readonly resolvesAt: number; // ms
};

export type SettleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    ownerColor: Color,
    startAt: number,
    resolvesAt: number,
    worldTileX: number,
    worldTileY: number
  ) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createSettleOverlay = (scene: Scene, maxTiles: number): SettleOverlay => {
  const personGeometry = new BoxGeometry(PERSON_W, PERSON_H, PERSON_D);
  const personMaterial = new MeshStandardMaterial({
    // Slight emissive lifts the dots out of shadow so they read as
    // distinct points rather than blending into the dark plate.
    color: "#0a0d12",
    emissive: "#1a1d22",
    emissiveIntensity: 0.6,
    roughness: 0.92,
    metalness: 0,
    flatShading: true
  });

  const tintGeometry = new PlaneGeometry(TINT_SIZE, TINT_SIZE);
  tintGeometry.rotateX(-Math.PI * 0.5);
  // Higher opacity than the original 0.18 so the fill reads clearly
  // against grass / sand.
  const tintMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.55,
    roughness: 1,
    metalness: 0,
    depthWrite: false
  });

  const frameGeometry = new BoxGeometry(FRAME_LENGTH, FRAME_HEIGHT, FRAME_THICKNESS);
  const frameMaterial = new MeshStandardMaterial({
    color: "#fff1b9",
    transparent: true,
    opacity: 0.78,
    roughness: 0.7,
    metalness: 0,
    emissive: "#fff1b9",
    emissiveIntensity: 0.45,
    depthWrite: false
  });

  const peopleMesh = new InstancedMesh(personGeometry, personMaterial, maxTiles * PEOPLE_PER_TILE);
  const tintMesh = new InstancedMesh(tintGeometry, tintMaterial, maxTiles);
  const frameNMesh = new InstancedMesh(frameGeometry, frameMaterial, maxTiles);
  const frameSMesh = new InstancedMesh(frameGeometry, frameMaterial, maxTiles);
  const frameEMesh = new InstancedMesh(frameGeometry, frameMaterial, maxTiles);
  const frameWMesh = new InstancedMesh(frameGeometry, frameMaterial, maxTiles);
  const allMeshes = [peopleMesh, tintMesh, frameNMesh, frameSMesh, frameEMesh, frameWMesh];
  for (const m of allMeshes) {
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 5;
  }
  scene.add(...allMeshes);

  // Hoisted temps so commit() and tick() don't allocate per call. The
  // 90° rotation matrix is a constant — built once and reused.
  const matrix = new Matrix4();
  const tmpColor = new Color();
  const tmpFrameMatrix = new Matrix4();
  const tmpTintMatrix = new Matrix4();
  const tmpScale = { x: 1, y: 1, z: 1 };
  const rotateY90 = new Matrix4().makeRotationY(Math.PI * 0.5);

  const entries: TileEntry[] = [];

  const clear = (): void => {
    entries.length = 0;
  };

  const addInstance = (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    ownerColor: Color,
    startAt: number,
    resolvesAt: number,
    worldTileX: number,
    worldTileY: number
  ): void => {
    if (entries.length >= maxTiles) return;
    entries.push({ worldTileX, worldTileY, sceneX, sceneZ, surfaceY, startAt, resolvesAt });
    // Tint colour is set right away (doesn't change per frame).
    tmpColor.copy(ownerColor);
    tintMesh.setColorAt(entries.length - 1, tmpColor);
  };

  const commit = (): void => {
    // commit() finalises tint + frame counts and signals the colour
    // attribute as dirty. People matrices are written by tick() per
    // frame so the wander animates regardless of orchestrator throttle.
    tintMesh.count = entries.length;
    frameNMesh.count = entries.length;
    frameSMesh.count = entries.length;
    frameEMesh.count = entries.length;
    frameWMesh.count = entries.length;
    if (tintMesh.instanceColor) tintMesh.instanceColor.needsUpdate = true;

    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i]!;
      // Frame perimeter (does not animate). Tint plate matrix is set in
      // tick() so it can grow with progress.
      matrix.makeTranslation(e.sceneX, e.surfaceY + FRAME_Y, e.sceneZ - FRAME_HALF);
      frameNMesh.setMatrixAt(i, matrix);
      matrix.makeTranslation(e.sceneX, e.surfaceY + FRAME_Y, e.sceneZ + FRAME_HALF);
      frameSMesh.setMatrixAt(i, matrix);
      // E and W frames: rotate 90° so the long side runs along Z, then
      // translate. multiplyMatrices writes into tmpFrameMatrix.
      tmpFrameMatrix.makeTranslation(e.sceneX + FRAME_HALF, e.surfaceY + FRAME_Y, e.sceneZ).multiply(rotateY90);
      frameEMesh.setMatrixAt(i, tmpFrameMatrix);
      tmpFrameMatrix.makeTranslation(e.sceneX - FRAME_HALF, e.surfaceY + FRAME_Y, e.sceneZ).multiply(rotateY90);
      frameWMesh.setMatrixAt(i, tmpFrameMatrix);
    }
    frameNMesh.instanceMatrix.needsUpdate = true;
    frameSMesh.instanceMatrix.needsUpdate = true;
    frameEMesh.instanceMatrix.needsUpdate = true;
    frameWMesh.instanceMatrix.needsUpdate = true;
  };

  const tick = (nowMs: number): void => {
    tintMesh.count = entries.length;
    if (entries.length === 0) {
      peopleMesh.count = 0;
      return;
    }

    // Tint plate animates here every frame so the fill grows continuously
    // even between rebuilds. Compose translation + non-uniform scale per
    // entry: width = TINT_SIZE * progress, anchored at the west edge so
    // the colour sweeps in from the left.
    // startAt / resolvesAt are recorded as Date.now() at addInstance time
    // (matches the queue-logic side); read the wall clock once per tick
    // and reuse for every entry.
    const nowDate = Date.now();
    let writeIdx = 0;
    for (let entryIdx = 0; entryIdx < entries.length; entryIdx += 1) {
      const e = entries[entryIdx]!;
      const totalMs = Math.max(1, e.resolvesAt - e.startAt);
      const progress = Math.max(0, Math.min(1, (nowDate - e.startAt) / totalMs));
      const fillProgress = Math.max(0.04, progress);
      const halfWidth = TINT_HALF * fillProgress;
      const centerX = e.sceneX - TINT_HALF + halfWidth;
      tmpScale.x = fillProgress;
      tmpScale.y = 1;
      tmpScale.z = 1;
      tmpTintMatrix.makeScale(tmpScale.x, tmpScale.y, tmpScale.z);
      tmpTintMatrix.setPosition(centerX, e.surfaceY + TINT_Y, e.sceneZ);
      tintMesh.setMatrixAt(entryIdx, tmpTintMatrix);

      // Active people count grows with progress so a freshly-started
      // settlement starts with PEOPLE_MIN wandering and ramps up to the
      // full PEOPLE_PER_TILE as completion approaches.
      const activeCount = Math.max(PEOPLE_MIN, Math.round(PEOPLE_MIN + progress * (PEOPLE_PER_TILE - PEOPLE_MIN)));
      const wanderTime = nowMs * WANDER_TIME_SCALE;
      for (let i = 0; i < activeCount; i += 1) {
        const point = wanderPoint(wanderTime, e.worldTileX, e.worldTileY, i);
        // point.x / point.y are in [0,1]; map to tile-local [-0.42, 0.42]
        // so people stay inside the perimeter frame.
        matrix.makeTranslation(
          e.sceneX + (point.x - 0.5) * 0.84,
          e.surfaceY + PERSON_Y,
          e.sceneZ + (point.y - 0.5) * 0.84
        );
        peopleMesh.setMatrixAt(writeIdx, matrix);
        writeIdx += 1;
      }
    }
    peopleMesh.count = writeIdx;
    peopleMesh.instanceMatrix.needsUpdate = true;
    tintMesh.instanceMatrix.needsUpdate = true;

    // Pulse the frame brightness so the tile reads as "in progress".
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 180);
    frameMaterial.opacity = 0.62 + pulse * 0.28;
    frameMaterial.emissiveIntensity = 0.32 + pulse * 0.32;
  };

  const dispose = (): void => {
    scene.remove(...allMeshes);
    personGeometry.dispose();
    tintGeometry.dispose();
    frameGeometry.dispose();
    personMaterial.dispose();
    tintMaterial.dispose();
    frameMaterial.dispose();
  };

  return { clear, addInstance, commit, tick, dispose };
};

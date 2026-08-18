import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene
} from "three";
import { domeFalloff } from "../client-map-3d-hills.js";
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";

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

const HILL_SUBDIV = 6;
const HILL_VERTS_PER_TILE = (HILL_SUBDIV + 1) * (HILL_SUBDIV + 1);
const HILL_INDICES_PER_TILE = HILL_SUBDIV * HILL_SUBDIV * 6;
const HILL_DRAPE_CLEARANCE = 0.012;

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
  readonly addHillTile: (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    corner00Y: number,
    corner10Y: number,
    corner01Y: number,
    corner11Y: number,
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

  // Flat entries and hill entries are capped independently (`maxTiles`
  // vs. `maxHillTiles`), but the frame perimeter and people wander share
  // one InstancedMesh across both, so their capacity must cover the sum.
  const maxHillTiles = Math.min(maxTiles, 1000);
  const maxFrameEntries = maxTiles + maxHillTiles;
  const peopleMesh = new InstancedMesh(personGeometry, personMaterial, maxFrameEntries * PEOPLE_PER_TILE);
  const tintMesh = new InstancedMesh(tintGeometry, tintMaterial, maxTiles);
  const frameNMesh = new InstancedMesh(frameGeometry, frameMaterial, maxFrameEntries);
  const frameSMesh = new InstancedMesh(frameGeometry, frameMaterial, maxFrameEntries);
  const frameEMesh = new InstancedMesh(frameGeometry, frameMaterial, maxFrameEntries);
  const frameWMesh = new InstancedMesh(frameGeometry, frameMaterial, maxFrameEntries);
  const allMeshes = [peopleMesh, tintMesh, frameNMesh, frameSMesh, frameEMesh, frameWMesh];
  for (const m of allMeshes) {
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 5;
  }
  scene.add(...allMeshes);

  const hillTintGeom = new BufferGeometry();
  hillTintGeom.setAttribute("position", new BufferAttribute(new Float32Array(maxHillTiles * HILL_VERTS_PER_TILE * 3), 3));
  hillTintGeom.setAttribute("color", new BufferAttribute(new Float32Array(maxHillTiles * HILL_VERTS_PER_TILE * 3), 3));
  hillTintGeom.setIndex(new BufferAttribute(new Uint32Array(maxHillTiles * HILL_INDICES_PER_TILE), 1));
  const hillTintMesh = new Mesh(hillTintGeom, tintMaterial);
  hillTintMesh.renderOrder = 5;
  hillTintMesh.frustumCulled = false;
  scene.add(hillTintMesh);
  let hillTintCount = 0;

  // Hoisted temps so commit() and tick() don't allocate per call. The
  // 90° rotation matrix is a constant — built once and reused.
  const matrix = new Matrix4();
  const tmpColor = new Color();
  const tmpFrameMatrix = new Matrix4();
  const tmpTintMatrix = new Matrix4();
  const tmpScale = { x: 1, y: 1, z: 1 };
  const rotateY90 = new Matrix4().makeRotationY(Math.PI * 0.5);

  const entries: TileEntry[] = [];
  // Hill tiles are tracked separately from `entries` so the flat
  // `tintMesh` InstancedMesh never gets a matrix written for them — that
  // mesh is a flat plane and would clip into/poke through the dome
  // exactly like the bug this drape logic fixes. Hill tiles get their
  // tint from `hillTintMesh` (vertex-draped) instead; they still share
  // the frame perimeter and people-wander logic with flat entries, using
  // the hill's domed peak height rather than flat ground height.
  const hillEntries: TileEntry[] = [];

  const clear = (): void => {
    entries.length = 0;
    hillEntries.length = 0;
    hillTintCount = 0;
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
    tmpColor.copy(ownerColor);
    tintMesh.setColorAt(entries.length - 1, tmpColor);
  };

  const addHillTile = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    corner00Y: number,
    corner10Y: number,
    corner01Y: number,
    corner11Y: number,
    ownerColor: Color,
    startAt: number,
    resolvesAt: number,
    worldTileX: number,
    worldTileY: number
  ): void => {
    if (hillTintCount >= maxHillTiles) return;
    // Peak height at the tile's own center (r=0 → domeFalloff=1), used to
    // place the frame perimeter and wandering people on top of the dome
    // instead of at flat ground level.
    const avgCornerY = (corner00Y + corner10Y + corner01Y + corner11Y) * 0.25;
    const domePeakY = avgCornerY + HEIGHTFIELD_HILLS_ELEVATION_BONUS + HILL_DRAPE_CLEARANCE;
    hillEntries.push({ worldTileX, worldTileY, sceneX: (x0 + x1) * 0.5, sceneZ: (z0 + z1) * 0.5, surfaceY: domePeakY, startAt, resolvesAt });

    const positions = hillTintGeom.getAttribute("position") as BufferAttribute;
    const colors = hillTintGeom.getAttribute("color") as BufferAttribute;
    const indices = hillTintGeom.getIndex() as BufferAttribute;

    const vertsPerRow = HILL_SUBDIV + 1;
    const baseVertex = hillTintCount * HILL_VERTS_PER_TILE;
    let vi = baseVertex;

    for (let b = 0; b <= HILL_SUBDIV; b += 1) {
      for (let a = 0; a <= HILL_SUBDIV; a += 1) {
        const fx = a / HILL_SUBDIV;
        const fz = b / HILL_SUBDIV;
        const u = fx - 0.5;
        const v = fz - 0.5;
        const r = Math.hypot(u, v);
        const top = corner00Y + (corner10Y - corner00Y) * fx;
        const bottom = corner01Y + (corner11Y - corner01Y) * fx;
        const groundY = top + (bottom - top) * fz;
        const p = vi * 3;
        positions.array[p + 0] = x0 + (x1 - x0) * fx;
        (positions.array as Float32Array)[p + 1] = groundY + HEIGHTFIELD_HILLS_ELEVATION_BONUS * domeFalloff(r) + HILL_DRAPE_CLEARANCE;
        positions.array[p + 2] = z0 + (z1 - z0) * fz;
        colors.array[p + 0] = ownerColor.r;
        colors.array[p + 1] = ownerColor.g;
        colors.array[p + 2] = ownerColor.b;
        vi += 1;
      }
    }

    const baseIndex = hillTintCount * HILL_INDICES_PER_TILE;
    let ii = baseIndex;
    for (let b = 0; b < HILL_SUBDIV; b += 1) {
      for (let a = 0; a < HILL_SUBDIV; a += 1) {
        const i00 = baseVertex + b * vertsPerRow + a;
        const i10 = i00 + 1;
        const i01 = i00 + vertsPerRow;
        const i11 = i01 + 1;
        (indices.array as Uint32Array)[ii + 0] = i00;
        (indices.array as Uint32Array)[ii + 1] = i01;
        (indices.array as Uint32Array)[ii + 2] = i10;
        (indices.array as Uint32Array)[ii + 3] = i10;
        (indices.array as Uint32Array)[ii + 4] = i01;
        (indices.array as Uint32Array)[ii + 5] = i11;
        ii += 6;
      }
    }

    hillTintCount += 1;
  };

  const commit = (): void => {
    // commit() finalises tint + frame counts and signals the colour
    // attribute as dirty. People matrices are written by tick() per
    // frame so the wander animates regardless of orchestrator throttle.
    // tintMesh (flat plane) only covers flat-ground entries — hill tiles
    // render their tint via hillTintMesh instead so they don't get a
    // flat plate clipping into the dome on top of the draped one.
    tintMesh.count = entries.length;
    const frameCount = entries.length + hillEntries.length;
    frameNMesh.count = frameCount;
    frameSMesh.count = frameCount;
    frameEMesh.count = frameCount;
    frameWMesh.count = frameCount;
    if (tintMesh.instanceColor) tintMesh.instanceColor.needsUpdate = true;

    // Frame perimeter (does not animate) covers both flat and hill
    // entries, using each entry's own surfaceY (flat ground vs. the
    // hill's domed peak) so it sits on the visible surface either way.
    for (let i = 0; i < frameCount; i += 1) {
      const e = i < entries.length ? entries[i]! : hillEntries[i - entries.length]!;
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
    frameNMesh.instanceMatrix.clearUpdateRanges();
    frameNMesh.instanceMatrix.addUpdateRange(0, frameNMesh.count * 16);
    frameNMesh.instanceMatrix.needsUpdate = true;
    frameSMesh.instanceMatrix.clearUpdateRanges();
    frameSMesh.instanceMatrix.addUpdateRange(0, frameSMesh.count * 16);
    frameSMesh.instanceMatrix.needsUpdate = true;
    frameEMesh.instanceMatrix.clearUpdateRanges();
    frameEMesh.instanceMatrix.addUpdateRange(0, frameEMesh.count * 16);
    frameEMesh.instanceMatrix.needsUpdate = true;
    frameWMesh.instanceMatrix.clearUpdateRanges();
    frameWMesh.instanceMatrix.addUpdateRange(0, frameWMesh.count * 16);
    frameWMesh.instanceMatrix.needsUpdate = true;

    if (hillTintCount > 0) {
      const posAttr = hillTintGeom.getAttribute("position");
      const colAttr = hillTintGeom.getAttribute("color");
      const idxAttr = hillTintGeom.getIndex();
      if (posAttr) posAttr.needsUpdate = true;
      if (colAttr) colAttr.needsUpdate = true;
      if (idxAttr) idxAttr.needsUpdate = true;
    }
    // Bound the draw range to only the tiles actually written this frame.
    // Without this, stale data from previous settlements remains in the
    // preallocated buffer and renders as a ghost overlay that follows the
    // camera (because the coordinates are frozen relative to the old camera
    // position). When hillTintCount drops to 0, setDrawRange(0, 0) correctly
    // zeros the range and prevents rendering anything.
    hillTintGeom.setDrawRange(0, hillTintCount * HILL_INDICES_PER_TILE);
  };

  const tick = (nowMs: number): void => {
    tintMesh.count = entries.length;
    const totalCount = entries.length + hillEntries.length;
    if (totalCount === 0) {
      peopleMesh.count = 0;
      return;
    }

    // Tint plate animates here every frame so the fill grows continuously
    // even between rebuilds. Compose translation + non-uniform scale per
    // entry: width = TINT_SIZE * progress, anchored at the west edge so
    // the colour sweeps in from the left. Hill tiles skip this (their
    // tint is the vertex-draped hillTintMesh, which doesn't animate a
    // fill sweep) but still get people wander below.
    // startAt / resolvesAt are recorded as Date.now() at addInstance time
    // (matches the queue-logic side); read the wall clock once per tick
    // and reuse for every entry.
    const nowDate = Date.now();
    let writeIdx = 0;
    for (let idx = 0; idx < totalCount; idx += 1) {
      const isHill = idx >= entries.length;
      const e = isHill ? hillEntries[idx - entries.length]! : entries[idx]!;
      const totalMs = Math.max(1, e.resolvesAt - e.startAt);
      const progress = Math.max(0, Math.min(1, (nowDate - e.startAt) / totalMs));

      if (!isHill) {
        const fillProgress = Math.max(0.04, progress);
        const halfWidth = TINT_HALF * fillProgress;
        const centerX = e.sceneX - TINT_HALF + halfWidth;
        tmpScale.x = fillProgress;
        tmpScale.y = 1;
        tmpScale.z = 1;
        tmpTintMatrix.makeScale(tmpScale.x, tmpScale.y, tmpScale.z);
        tmpTintMatrix.setPosition(centerX, e.surfaceY + TINT_Y, e.sceneZ);
        tintMesh.setMatrixAt(idx, tmpTintMatrix);
      }

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
    peopleMesh.instanceMatrix.clearUpdateRanges();
    peopleMesh.instanceMatrix.addUpdateRange(0, peopleMesh.count * 16);
    peopleMesh.instanceMatrix.needsUpdate = true;
    tintMesh.instanceMatrix.clearUpdateRanges();
    tintMesh.instanceMatrix.addUpdateRange(0, tintMesh.count * 16);
    tintMesh.instanceMatrix.needsUpdate = true;

    // Pulse the frame brightness so the tile reads as "in progress".
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 180);
    frameMaterial.opacity = 0.62 + pulse * 0.28;
    frameMaterial.emissiveIntensity = 0.32 + pulse * 0.32;
  };

  const dispose = (): void => {
    scene.remove(...allMeshes);
    scene.remove(hillTintMesh);
    personGeometry.dispose();
    tintGeometry.dispose();
    frameGeometry.dispose();
    hillTintGeom.dispose();
    personMaterial.dispose();
    tintMaterial.dispose();
    frameMaterial.dispose();
  };

  return { clear, addInstance, addHillTile, commit, tick, dispose };
};

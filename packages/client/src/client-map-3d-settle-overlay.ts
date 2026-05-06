import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene
} from "three";
import { settlePixelWanderPoint } from "./client-capture-effects.js";

// 3D settle loader: when a tile is being settled, a swarm of small black
// "people" boxes wander on top of the tile, with the owner-color tint
// plate underneath and a pulsing yellow perimeter frame. Wander pattern
// matches the 2D loader (uses settlePixelWanderPoint), so the cadence of
// pause-then-walk is identical.

const PEOPLE_PER_TILE = 10;
const PERSON_W = 0.05;
const PERSON_H = 0.10;
const PERSON_D = 0.05;
const PERSON_Y = PERSON_H * 0.5 + 0.005;

const TINT_SIZE = 0.94;
const TINT_Y = 0.014;

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
  readonly progress: number; // 0..1
};

export type SettleOverlay = {
  readonly clear: () => void;
  readonly addInstance: (
    sceneX: number,
    sceneZ: number,
    surfaceY: number,
    ownerColor: Color,
    progress: number,
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
    color: "#0a0d12",
    roughness: 0.92,
    metalness: 0,
    flatShading: true
  });

  const tintGeometry = new PlaneGeometry(TINT_SIZE, TINT_SIZE);
  tintGeometry.rotateX(-Math.PI * 0.5);
  const tintMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.18,
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
    progress: number,
    worldTileX: number,
    worldTileY: number
  ): void => {
    if (entries.length >= maxTiles) return;
    entries.push({ worldTileX, worldTileY, sceneX, sceneZ, surfaceY, progress });
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
      matrix.makeTranslation(e.sceneX, e.surfaceY + TINT_Y, e.sceneZ);
      tintMesh.setMatrixAt(i, matrix);
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
    tintMesh.instanceMatrix.needsUpdate = true;
    frameNMesh.instanceMatrix.needsUpdate = true;
    frameSMesh.instanceMatrix.needsUpdate = true;
    frameEMesh.instanceMatrix.needsUpdate = true;
    frameWMesh.instanceMatrix.needsUpdate = true;
  };

  const tick = (nowMs: number): void => {
    if (entries.length === 0) {
      peopleMesh.count = 0;
      return;
    }

    // Active people count grows with progress so a freshly-started
    // settlement has fewer wandering than a near-finished one.
    let writeIdx = 0;
    for (const e of entries) {
      const activeCount = Math.max(3, Math.round(3 + e.progress * (PEOPLE_PER_TILE - 3)));
      for (let i = 0; i < activeCount; i += 1) {
        const point = settlePixelWanderPoint(nowMs, e.worldTileX, e.worldTileY, i);
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

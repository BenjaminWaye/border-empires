import {
  CanvasTexture,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3
} from "three";

// Cracked-shield badge on own settled tiles with 3+ exposed sides
// (local-support count ≤ 1) when LOCAL_SUPPORT_DEFENSE_ENABLED.
// Follows the same instanced-mesh + bob pattern as the unfed-badge
// overlay (client-map-3d-unfed-badge-overlay.ts).  One canvas texture
// is shared; the badge floats just above the tile surface so it does
// not compete with town/fort silhouettes.

const BADGE_SIZE = 0.30;
const CANVAS_SIZE = 192;

const FLOAT_BASE = 0.22;
const BOB_AMPLITUDE = 0.04;
const BOB_PERIOD_MS = 3000;
const PHASE_PER_INSTANCE = Math.PI * 0.41;
const PLANE_TILT_X = -0.50;

const drawBadgeCanvas = (): HTMLCanvasElement | null => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const C = CANVAS_SIZE;
  const PAD = 14;
  const RADIUS = 22;
  const left = PAD;
  const top = PAD;
  const right = C - PAD;
  const bottom = C - PAD;

  // Shield background — slightly warm off-white, darker rim.
  ctx.fillStyle = "#e8d8c0";
  ctx.strokeStyle = "#6b3a18";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(left + RADIUS, top);
  ctx.lineTo(right - RADIUS, top);
  ctx.quadraticCurveTo(right, top, right, top + RADIUS);
  ctx.lineTo(right, bottom - RADIUS);
  ctx.quadraticCurveTo(right, bottom, right - RADIUS, bottom);
  ctx.lineTo(left + RADIUS, bottom);
  ctx.quadraticCurveTo(left, bottom, left, bottom - RADIUS);
  ctx.lineTo(left, top + RADIUS);
  ctx.quadraticCurveTo(left, top, left + RADIUS, top);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Main crack: diagonal from upper-left to lower-right with a jog.
  const MID = C * 0.5;
  ctx.strokeStyle = "#7a1818";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(PAD + 18, PAD + 18);
  ctx.lineTo(MID - 10, MID - 16);
  ctx.lineTo(MID + 6, MID + 8);
  ctx.lineTo(C - PAD - 18, C - PAD - 18);
  ctx.stroke();

  // Secondary crack branching off the main one.
  ctx.strokeStyle = "#a02828";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(MID - 10, MID - 16);
  ctx.lineTo(MID - 28, MID + 22);
  ctx.stroke();

  // Thin hairline extension for texture.
  ctx.strokeStyle = "#b04030";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(MID + 6, MID + 8);
  ctx.lineTo(MID + 30, MID - 4);
  ctx.stroke();

  return canvas;
};

export type SupportBadgeOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createSupportBadgeOverlay = (scene: Scene, maxTiles: number): SupportBadgeOverlay => {
  const group = new Group();
  group.name = "support-badge-overlay";
  scene.add(group);

  const canvas = drawBadgeCanvas();
  const texture = canvas ? new CanvasTexture(canvas) : null;
  if (texture) {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }

  const planeGeometry = new PlaneGeometry(BADGE_SIZE, BADGE_SIZE);
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: DoubleSide,
    depthWrite: false
  });

  const mesh = new InstancedMesh(planeGeometry, material, maxTiles);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 7;
  group.add(mesh);

  const xs = new Float32Array(maxTiles);
  const ys = new Float32Array(maxTiles);
  const zs = new Float32Array(maxTiles);

  const tempMatrix = new Matrix4();
  const tempPos = new Vector3();
  const tempQuat = new Quaternion();
  const tempEuler = new Euler();
  const unitScale = new Vector3(1, 1, 1);
  let count = 0;
  let lastBobPhase = 0;

  const applyMatrix = (idx: number, cx: number, sy: number, cz: number, bobPhase: number): void => {
    const phase = bobPhase + idx * PHASE_PER_INSTANCE;
    const bob = Math.sin(phase) * BOB_AMPLITUDE;
    tempPos.set(cx, sy + FLOAT_BASE + bob, cz);
    tempEuler.set(PLANE_TILT_X, 0, 0, "XYZ");
    tempQuat.setFromEuler(tempEuler);
    tempMatrix.compose(tempPos, tempQuat, unitScale);
    mesh.setMatrixAt(idx, tempMatrix);
  };

  const clear = (): void => { count = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    if (count >= maxTiles) return;
    xs[count] = centerX;
    ys[count] = surfaceY;
    zs[count] = centerZ;
    applyMatrix(count, centerX, surfaceY, centerZ, lastBobPhase);
    count += 1;
  };

  const commit = (): void => {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  };

  const tick = (nowMs: number): void => {
    if (count === 0) return;
    lastBobPhase = ((nowMs % BOB_PERIOD_MS) / BOB_PERIOD_MS) * Math.PI * 2;
    for (let i = 0; i < count; i += 1) {
      applyMatrix(i, xs[i]!, ys[i]!, zs[i]!, lastBobPhase);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    planeGeometry.dispose();
    material.dispose();
    texture?.dispose();
  };

  return { group, clear, addInstance, commit, tick, dispose };
};

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

// Floats a small crystal-blue badge with an hourglass (⏳) above an owned
// observatory whose crystal-casting is still on cooldown
// (`tile.observatory.cooldownUntil > now`). It mirrors the unfed-town
// badge (see client-map-3d-unfed-badge-overlay.ts): one shared canvas
// texture, a single InstancedMesh of textured planes, and a slow bob so
// the eye is drawn to observatories that can't cast yet. Detailed
// remaining time lives in the tile-menu overview; this badge is just the
// at-a-glance "recharging" marker.

const BADGE_SIZE = 0.36;
const CANVAS_SIZE = 192;

// The observatory mesh is shorter than the tallest town spire, but reuse
// the same float base/bob as the unfed badge for a consistent feel.
const FLOAT_BASE = 1.30;
const BOB_AMPLITUDE = 0.07;
const BOB_PERIOD_MS = 2400;
const PHASE_PER_INSTANCE = Math.PI * 0.37;
// Back-tilt around X so the face reads from the default perspective
// camera tilt (PERSPECTIVE_TILT_RADIANS = 0.6) — matches the unfed badge.
const PLANE_TILT_X = -0.50;

const drawBadgeCanvas = (): HTMLCanvasElement | null => {
  // The unit test imports this in a Node env with no `document`; skip
  // canvas painting there. The overlay still builds the InstancedMesh
  // (with no texture) so the regression assertions pass.
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Disc background: crystal-blue fill with a darker rim, echoing the
  // cyan aether/crystal palette used for crystal-action targeting.
  const center = CANVAS_SIZE / 2;
  const radius = center - 14;
  ctx.fillStyle = "#bfe8ff";
  ctx.strokeStyle = "#1f5d7a";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ⏳ hourglass centred — the universal "recharging / wait" glyph.
  ctx.font = `${Math.round(CANVAS_SIZE * 0.6)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⏳", center, center + CANVAS_SIZE * 0.02);

  return canvas;
};

export type ObservatoryCooldownBadgeOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createObservatoryCooldownBadgeOverlay = (
  scene: Scene,
  maxTiles: number
): ObservatoryCooldownBadgeOverlay => {
  const group = new Group();
  group.name = "observatory-cooldown-badge-overlay";
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

  const applyMatrix = (
    idx: number,
    centerX: number,
    surfaceY: number,
    centerZ: number,
    bobPhase: number
  ): void => {
    const phase = bobPhase + idx * PHASE_PER_INSTANCE;
    const bob = Math.sin(phase) * BOB_AMPLITUDE;
    tempPos.set(centerX, surfaceY + FLOAT_BASE + bob, centerZ);
    tempEuler.set(PLANE_TILT_X, 0, 0, "XYZ");
    tempQuat.setFromEuler(tempEuler);
    tempMatrix.compose(tempPos, tempQuat, unitScale);
    mesh.setMatrixAt(idx, tempMatrix);
  };

  const clear = (): void => {
    count = 0;
  };

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

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

// Floats a green up-arrow badge above an owned, settled town that has grown
// enough population to upgrade to its next tier (Town→City → Great City →
// Metropolis). Driven by the shouldShowTownUpgradeReadyBadge predicate in
// client-town-growth.ts, which reads the server-stamped
// town.nextPopulationTierUpgrade.available flag. It mirrors the unfed-town
// badge (see client-map-3d-unfed-badge-overlay.ts) and the observatory
// cooldown badge: one shared canvas texture, a single InstancedMesh of
// textured planes, and a slow bob so the eye is drawn to towns with a paid
// tile-menu upgrade action waiting. Cost/gold availability lives in the
// tile-menu; this badge is just the at-a-glance "upgrade ready" marker.

const BADGE_SIZE = 0.36;
const CANVAS_SIZE = 192;

// Towns can have a tall METROPOLIS spire; reuse the unfed badge's float base
// so the badge clears the biggest roof on every orbit angle.
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

  // Shield background: soft green fill with a darker rim — green reads as
  // "go / action available", distinct from the warm-gold shortage badge
  // (red slash) and the crystal-blue cooldown badge.
  const PAD = 12;
  const RADIUS = 28;
  const left = PAD;
  const top = PAD;
  const right = CANVAS_SIZE - PAD;
  const bottom = CANVAS_SIZE - PAD;

  ctx.fillStyle = "#d9f0c6";
  ctx.strokeStyle = "#3f7a2a";
  ctx.lineWidth = 6;
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

  // Up-arrow glyph centred — the same glyph the tile-menu uses for every
  // grow_-to_tier upgrade action (client-tile-menu-html.ts).
  ctx.font = `${Math.round(CANVAS_SIZE * 0.62)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⬆", CANVAS_SIZE / 2, CANVAS_SIZE / 2 + CANVAS_SIZE * 0.02);

  return canvas;
};

export type UpgradeReadyBadgeOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createUpgradeReadyBadgeOverlay = (
  scene: Scene,
  maxTiles: number
): UpgradeReadyBadgeOverlay => {
  const group = new Group();
  group.name = "upgrade-ready-badge-overlay";
  scene.add(group);

  const canvas = drawBadgeCanvas();
  const texture = canvas ? new CanvasTexture(canvas) : null;
  if (texture) {
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
  }

  const planeGeometry = new PlaneGeometry(BADGE_SIZE, BADGE_SIZE);
  const material = new MeshBasicMaterial({ toneMapped: false,
    map: texture,
    transparent: true,
    side: DoubleSide,
    depthWrite: false
  });

  const mesh = new InstancedMesh(planeGeometry, material, maxTiles);
  mesh.frustumCulled = false;
  mesh.count = 0;
  // Same render band as the other floating badges (27): above every
  // ground/road overlay but below the transient selection marker band (28+),
  // so a road passing beneath a badge can't paint over it.
  mesh.renderOrder = 27;
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
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const tick = (nowMs: number): void => {
    if (count === 0) return;
    lastBobPhase = ((nowMs % BOB_PERIOD_MS) / BOB_PERIOD_MS) * Math.PI * 2;
    for (let i = 0; i < count; i += 1) {
      applyMatrix(i, xs[i]!, ys[i]!, zs[i]!, lastBobPhase);
    }
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
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
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

// 3D parity for the 2D unfed-town badge: `tile.town && !tile.town.isFed`
// floats a small shield-shaped badge above the town with the in-game
// food icon (🍞 emoji, see client-panel-html.ts FOOD row + client-map-
// display.ts) and a red diagonal slash drawn over it on a canvas
// texture. The whole badge slowly spins around Y and bobs up/down so
// the eye is drawn to towns that need attention.
//
// One canvas texture is shared across every badge — every unfed town
// shows the same icon — and a single InstancedMesh of textured planes
// renders one badge per instance. tick(nowMs) recomputes each instance
// matrix with the current spin + bob offsets.

const BADGE_SIZE = 0.36;
const CANVAS_SIZE = 192;

// Float position. METROPOLIS spire reaches 1.12; centre at FLOAT_BASE
// so even the largest town clears it on every orbit angle. The bob
// adds ±BOB_AMPLITUDE around this point.
const FLOAT_BASE = 1.30;
const BOB_AMPLITUDE = 0.06;
const BOB_PERIOD_MS = 2600;
// One full rotation every SPIN_PERIOD_MS — slow enough to read as
// "drawing attention" without becoming a strobe.
const SPIN_PERIOD_MS = 5400;
// Phase offset between adjacent badges so a cluster of unfed towns
// doesn't appear to bob in lock-step.
const PHASE_PER_INSTANCE = Math.PI * 0.37;

const drawBadgeCanvas = (): HTMLCanvasElement | null => {
  // The unit test imports createUnfedBadgeOverlay in a Node env that
  // has no `document`; skip canvas painting there. The overlay still
  // constructs the InstancedMesh (with no texture) so the regression
  // assertions on mesh count and addInstance/clear/commit pass.
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Shield background: rounded rectangle, warm gold with a darker rim.
  const PAD = 12;
  const RADIUS = 28;
  const left = PAD;
  const top = PAD;
  const right = CANVAS_SIZE - PAD;
  const bottom = CANVAS_SIZE - PAD;

  ctx.fillStyle = "#f3e2a8";
  ctx.strokeStyle = "#8a6418";
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

  // 🍞 loaf emoji centred — same glyph the game uses for food (see
  // client-panel-html.ts: { key: "FOOD", icon: "🍞" }).
  ctx.font = `${Math.round(CANVAS_SIZE * 0.62)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🍞", CANVAS_SIZE / 2, CANVAS_SIZE / 2 + CANVAS_SIZE * 0.02);

  // Red diagonal slash from top-right to bottom-left — the universal
  // prohibition slash, signalling "not enough food".
  const SLASH_MARGIN = 26;
  ctx.strokeStyle = "#c94a38";
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(CANVAS_SIZE - SLASH_MARGIN, SLASH_MARGIN);
  ctx.lineTo(SLASH_MARGIN, CANVAS_SIZE - SLASH_MARGIN);
  ctx.stroke();

  return canvas;
};

export type UnfedBadgeOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createUnfedBadgeOverlay = (scene: Scene, maxTiles: number): UnfedBadgeOverlay => {
  const group = new Group();
  group.name = "unfed-badge-overlay";
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
  // Draw on top of town/forest silhouettes so the badge reads from any
  // orbit angle without depth-fighting the spire roof.
  mesh.renderOrder = 7;
  group.add(mesh);

  // Per-instance positions for tick() to re-compose matrices with the
  // current spin + bob offsets without re-running the per-tile
  // addInstance path.
  const xs = new Float32Array(maxTiles);
  const ys = new Float32Array(maxTiles);
  const zs = new Float32Array(maxTiles);

  const tempMatrix = new Matrix4();
  const tempPos = new Vector3();
  const tempQuat = new Quaternion();
  const tempEuler = new Euler();
  const unitScale = new Vector3(1, 1, 1);
  let count = 0;
  let lastSpinAngle = 0;
  let lastBobPhase = 0;

  const applyMatrix = (
    idx: number,
    centerX: number,
    surfaceY: number,
    centerZ: number,
    spinAngle: number,
    bobPhase: number
  ): void => {
    const phase = bobPhase + idx * PHASE_PER_INSTANCE;
    const bob = Math.sin(phase) * BOB_AMPLITUDE;
    tempPos.set(centerX, surfaceY + FLOAT_BASE + bob, centerZ);
    tempEuler.set(0, spinAngle, 0, "XYZ");
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
    // Seed with the most recent spin/bob so a newly-added badge doesn't
    // pop into the wrong orientation for one frame before tick() runs.
    applyMatrix(count, centerX, surfaceY, centerZ, lastSpinAngle, lastBobPhase);
    count += 1;
  };

  const commit = (): void => {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  };

  const tick = (nowMs: number): void => {
    if (count === 0) return;
    lastSpinAngle = ((nowMs % SPIN_PERIOD_MS) / SPIN_PERIOD_MS) * Math.PI * 2;
    lastBobPhase = ((nowMs % BOB_PERIOD_MS) / BOB_PERIOD_MS) * Math.PI * 2;
    for (let i = 0; i < count; i += 1) {
      applyMatrix(i, xs[i]!, ys[i]!, zs[i]!, lastSpinAngle, lastBobPhase);
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

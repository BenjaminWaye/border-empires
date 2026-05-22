import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene
} from "three";

// 3D parity for the 2D unfed-town badge painted in client-map-render.ts:
// `tile.town && !tile.town.isFed` produces a downward-pointing red triangle
// with a white "!" sitting in the corner of the town tile. In 3D we now
// float a small empty wooden bowl above the town silhouette and place a
// red downward chevron above it — the bowl says "this is about food" and
// the empty interior + red chevron says "this town has none". Reads
// instantly from any orbit angle as "hungry/unfed", which the prior
// generic warning triangle did not.

// Wooden bowl. Tapered cylinder (wider at top) so the silhouette looks
// like a real bowl from a perspective camera rather than a coin.
const BOWL_TOP_RADIUS = 0.13;
const BOWL_BOTTOM_RADIUS = 0.08;
const BOWL_HEIGHT = 0.06;
const BOWL_HALF_HEIGHT = BOWL_HEIGHT * 0.5;
// Darker interior disc sits just inside the bowl rim, suggesting an
// empty cavity rather than a stuffed-full container.
const BOWL_INTERIOR_TOP_RADIUS = 0.105;
const BOWL_INTERIOR_BOTTOM_RADIUS = 0.07;
const BOWL_INTERIOR_HEIGHT = 0.015;
const BOWL_INTERIOR_INSET = 0.018;

// Red urgency chevron above the bowl (3-sided cone rotated point-down).
const CHEVRON_RADIUS = 0.075;
const CHEVRON_HEIGHT = 0.12;
const CHEVRON_HALF_HEIGHT = CHEVRON_HEIGHT * 0.5;
const CHEVRON_GAP = 0.025;

// Lift above the town silhouette. METROPOLIS spire reaches
// SPIRE_BASE_HEIGHT (0.34) + SPIRE_TIP_HEIGHT (0.78) = 1.12; we float at
// 1.18 so the badge clears the spire on every tier.
const FLOAT_BASE = 1.18;
const BOWL_Y_OFFSET = FLOAT_BASE + BOWL_HALF_HEIGHT;
const BOWL_INTERIOR_Y_OFFSET = FLOAT_BASE + BOWL_HEIGHT - BOWL_INTERIOR_INSET;
const CHEVRON_Y_OFFSET = FLOAT_BASE + BOWL_HEIGHT + CHEVRON_GAP + CHEVRON_HALF_HEIGHT;

export type UnfedBadgeOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createUnfedBadgeOverlay = (scene: Scene, maxTiles: number): UnfedBadgeOverlay => {
  const group = new Group();
  group.name = "unfed-badge-overlay";
  scene.add(group);

  const bowlGeometry = new CylinderGeometry(BOWL_TOP_RADIUS, BOWL_BOTTOM_RADIUS, BOWL_HEIGHT, 14);
  const bowlInteriorGeometry = new CylinderGeometry(BOWL_INTERIOR_TOP_RADIUS, BOWL_INTERIOR_BOTTOM_RADIUS, BOWL_INTERIOR_HEIGHT, 14);
  // 3-segment cone → equilateral chevron silhouette from any yaw.
  // openEnded:false keeps a flat base so the underside reads cleanly.
  const chevronGeometry = new ConeGeometry(CHEVRON_RADIUS, CHEVRON_HEIGHT, 3, 1, false);
  // Rotate so the tip points down — "decline / missing" cue.
  chevronGeometry.rotateX(Math.PI);

  const bowlMaterial = new MeshStandardMaterial({
    color: "#9b6a36",
    roughness: 0.86,
    metalness: 0,
    flatShading: true,
    emissive: "#3a200a",
    emissiveIntensity: 0.25
  });
  const bowlInteriorMaterial = new MeshStandardMaterial({
    color: "#2e1a0e",
    roughness: 0.92,
    metalness: 0,
    flatShading: true
  });
  const chevronMaterial = new MeshStandardMaterial({
    color: "#c94a38",
    emissive: "#c94a38",
    emissiveIntensity: 0.75,
    roughness: 0.55,
    metalness: 0,
    flatShading: true
  });

  const bowlMesh = new InstancedMesh(bowlGeometry, bowlMaterial, maxTiles);
  const bowlInteriorMesh = new InstancedMesh(bowlInteriorGeometry, bowlInteriorMaterial, maxTiles);
  const chevronMesh = new InstancedMesh(chevronGeometry, chevronMaterial, maxTiles);

  for (const mesh of [bowlMesh, bowlInteriorMesh, chevronMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Draw on top of town/forest silhouettes so the badge reads from any
    // angle without depth-fighting the spire roof.
    mesh.renderOrder = 7;
  }
  group.add(bowlMesh, bowlInteriorMesh, chevronMesh);

  const tempMatrix = new Matrix4();
  let count = 0;

  const clear = (): void => {
    count = 0;
  };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    if (count >= maxTiles) return;
    tempMatrix.makeTranslation(centerX, surfaceY + BOWL_Y_OFFSET, centerZ);
    bowlMesh.setMatrixAt(count, tempMatrix);
    tempMatrix.makeTranslation(centerX, surfaceY + BOWL_INTERIOR_Y_OFFSET, centerZ);
    bowlInteriorMesh.setMatrixAt(count, tempMatrix);
    tempMatrix.makeTranslation(centerX, surfaceY + CHEVRON_Y_OFFSET, centerZ);
    chevronMesh.setMatrixAt(count, tempMatrix);
    count += 1;
  };

  const commit = (): void => {
    bowlMesh.count = count;
    bowlInteriorMesh.count = count;
    chevronMesh.count = count;
    bowlMesh.instanceMatrix.needsUpdate = true;
    bowlInteriorMesh.instanceMatrix.needsUpdate = true;
    chevronMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    bowlGeometry.dispose();
    bowlInteriorGeometry.dispose();
    chevronGeometry.dispose();
    bowlMaterial.dispose();
    bowlInteriorMaterial.dispose();
    chevronMaterial.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};

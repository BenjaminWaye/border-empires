import {
  BoxGeometry,
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
// with a white "!" sitting in the corner of the town tile. In 3D we float
// a small golden wheat sheaf above the town and draw a red diagonal slash
// across it — the universal "no grain / not enough food" pictogram. Reads
// instantly as "this town is unfed" from any orbit angle.

// Wheat sheaf: a short golden cylinder with a slightly fatter conical
// grain head on top. Bound tightly so it reads as a sheaf, not a stalk.
const SHEAF_RADIUS_TOP = 0.055;
const SHEAF_RADIUS_BOTTOM = 0.045;
const SHEAF_HEIGHT = 0.18;
const SHEAF_HALF_HEIGHT = SHEAF_HEIGHT * 0.5;

const GRAIN_RADIUS = 0.075;
const GRAIN_HEIGHT = 0.12;
const GRAIN_HALF_HEIGHT = GRAIN_HEIGHT * 0.5;

// Red diagonal slash: a long thin box rotated 45° around the Z axis so
// it crosses the sheaf from lower-left to upper-right when viewed from
// the front. Slash centered at sheaf mid-height.
const SLASH_LENGTH = 0.28;
const SLASH_THICKNESS = 0.022;
const SLASH_ROTATION_Z = Math.PI * 0.25;

// Float position. METROPOLIS spire reaches 1.12; float at 1.18 so the
// badge clears every town tier from any orbit angle.
const FLOAT_BASE = 1.18;
const SHEAF_Y_OFFSET = FLOAT_BASE + SHEAF_HALF_HEIGHT;
const GRAIN_Y_OFFSET = FLOAT_BASE + SHEAF_HEIGHT + GRAIN_HALF_HEIGHT;
const SLASH_Y_OFFSET = FLOAT_BASE + (SHEAF_HEIGHT + GRAIN_HEIGHT) * 0.5;

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

  const sheafGeometry = new CylinderGeometry(SHEAF_RADIUS_TOP, SHEAF_RADIUS_BOTTOM, SHEAF_HEIGHT, 10);
  const grainGeometry = new ConeGeometry(GRAIN_RADIUS, GRAIN_HEIGHT, 10);
  const slashGeometry = new BoxGeometry(SLASH_LENGTH, SLASH_THICKNESS, SLASH_THICKNESS);
  // Rotate the slash geometry once at construction so addInstance's
  // translation-only matrices land it diagonally without per-instance
  // quaternion math.
  slashGeometry.rotateZ(SLASH_ROTATION_Z);

  const sheafMaterial = new MeshStandardMaterial({
    color: "#d4a838",
    roughness: 0.78,
    metalness: 0.04,
    flatShading: true,
    emissive: "#5a3e10",
    emissiveIntensity: 0.2
  });
  const grainMaterial = new MeshStandardMaterial({
    color: "#b88224",
    roughness: 0.82,
    metalness: 0.04,
    flatShading: true,
    emissive: "#5a3e10",
    emissiveIntensity: 0.18
  });
  const slashMaterial = new MeshStandardMaterial({
    color: "#c94a38",
    emissive: "#c94a38",
    emissiveIntensity: 0.85,
    roughness: 0.5,
    metalness: 0,
    flatShading: true
  });

  const sheafMesh = new InstancedMesh(sheafGeometry, sheafMaterial, maxTiles);
  const grainMesh = new InstancedMesh(grainGeometry, grainMaterial, maxTiles);
  const slashMesh = new InstancedMesh(slashGeometry, slashMaterial, maxTiles);

  for (const mesh of [sheafMesh, grainMesh, slashMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Draw on top of town/forest silhouettes so the badge reads from any
    // angle without depth-fighting the spire roof.
    mesh.renderOrder = 7;
  }
  group.add(sheafMesh, grainMesh, slashMesh);

  const tempMatrix = new Matrix4();
  let count = 0;

  const clear = (): void => {
    count = 0;
  };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    if (count >= maxTiles) return;
    tempMatrix.makeTranslation(centerX, surfaceY + SHEAF_Y_OFFSET, centerZ);
    sheafMesh.setMatrixAt(count, tempMatrix);
    tempMatrix.makeTranslation(centerX, surfaceY + GRAIN_Y_OFFSET, centerZ);
    grainMesh.setMatrixAt(count, tempMatrix);
    tempMatrix.makeTranslation(centerX, surfaceY + SLASH_Y_OFFSET, centerZ);
    slashMesh.setMatrixAt(count, tempMatrix);
    count += 1;
  };

  const commit = (): void => {
    sheafMesh.count = count;
    grainMesh.count = count;
    slashMesh.count = count;
    sheafMesh.instanceMatrix.needsUpdate = true;
    grainMesh.instanceMatrix.needsUpdate = true;
    slashMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    sheafGeometry.dispose();
    grainGeometry.dispose();
    slashGeometry.dispose();
    sheafMaterial.dispose();
    grainMaterial.dispose();
    slashMaterial.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};

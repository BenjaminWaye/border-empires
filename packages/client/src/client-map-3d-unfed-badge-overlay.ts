import {
  ConeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene,
  SphereGeometry
} from "three";

// 3D parity for the 2D unfed-town badge painted in client-map-render.ts:
// `tile.town && !tile.town.isFed` produces a downward-pointing red triangle
// with a white "!" sitting in the corner of the town tile. In 3D we float a
// small red downward-pointing cone (the triangle) plus a sphere (the dot of
// the "!") above the town silhouette so the warning is legible from any
// camera angle.

// Triangle (3-sided cone, point-down). Width is roughly half a tile.
const TRIANGLE_RADIUS = 0.18;
const TRIANGLE_HEIGHT = 0.32;
const TRIANGLE_HALF_HEIGHT = TRIANGLE_HEIGHT * 0.5;

// Tiny "!" dot beneath the triangle's centre. Visually suggests the
// exclamation glyph that the 2D badge writes inside the triangle.
const DOT_RADIUS = 0.08;

// Lift above the town silhouette. The metropolis spire reaches
// SPIRE_BASE_HEIGHT (0.34) + SPIRE_TIP_HEIGHT (0.78) = 1.12, so we float at
// 1.18 to clear it on every tier.
const FLOAT_BASE = 1.18;
const TRIANGLE_Y_OFFSET = FLOAT_BASE + TRIANGLE_HALF_HEIGHT;
const DOT_Y_OFFSET = FLOAT_BASE + TRIANGLE_HEIGHT + DOT_RADIUS * 1.4;

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

  // 3 segments → equilateral-triangle silhouette regardless of camera yaw.
  // openEnded: false keeps a flat base so the underside reads as "triangle"
  // rather than a hollow cone when seen from above.
  const triangleGeometry = new ConeGeometry(TRIANGLE_RADIUS, TRIANGLE_HEIGHT, 3, 1, false);
  // Rotate the cone so its tip points down — same orientation as the 2D
  // downward-pointing warning triangle.
  triangleGeometry.rotateX(Math.PI);

  const dotGeometry = new SphereGeometry(DOT_RADIUS, 8, 6);

  const triangleMaterial = new MeshStandardMaterial({
    color: "#c94a38",
    emissive: "#c94a38",
    emissiveIntensity: 0.55,
    roughness: 0.55,
    metalness: 0,
    flatShading: true
  });
  const dotMaterial = new MeshStandardMaterial({
    color: "#fff3db",
    emissive: "#ffb892",
    emissiveIntensity: 0.45,
    roughness: 0.5,
    metalness: 0
  });

  const triangleMesh = new InstancedMesh(triangleGeometry, triangleMaterial, maxTiles);
  const dotMesh = new InstancedMesh(dotGeometry, dotMaterial, maxTiles);

  for (const mesh of [triangleMesh, dotMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    // Draw on top of town/forest silhouettes so the warning reads from any
    // angle without depth-fighting the spire roof.
    mesh.renderOrder = 7;
  }
  group.add(triangleMesh, dotMesh);

  const tempMatrix = new Matrix4();
  let count = 0;

  const clear = (): void => {
    count = 0;
  };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    if (count >= maxTiles) return;
    tempMatrix.makeTranslation(centerX, surfaceY + TRIANGLE_Y_OFFSET, centerZ);
    triangleMesh.setMatrixAt(count, tempMatrix);
    tempMatrix.makeTranslation(centerX, surfaceY + DOT_Y_OFFSET, centerZ);
    dotMesh.setMatrixAt(count, tempMatrix);
    count += 1;
  };

  const commit = (): void => {
    triangleMesh.count = count;
    dotMesh.count = count;
    triangleMesh.instanceMatrix.needsUpdate = true;
    dotMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    triangleGeometry.dispose();
    dotGeometry.dispose();
    triangleMaterial.dispose();
    dotMaterial.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};

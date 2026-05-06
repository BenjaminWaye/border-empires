import {
  BoxGeometry,
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3
} from "three";

// 3D attack overlay: a translucent red plate flush with the ground plus
// two diagonal red bars forming an X above it. Pulses alpha based on
// remaining countdown (passed in by the orchestrator), so an imminent
// attack flashes faster.

const PLATE_SIZE = 0.92;
const PLATE_Y = 0.024;
const X_BAR_LENGTH = 0.78;
const X_BAR_THICKNESS = 0.07;
const X_BAR_HEIGHT = 0.05;
const X_BAR_Y = 0.06;

export type AttackOverlay = {
  readonly clear: () => void;
  readonly addInstance: (worldX: number, worldZ: number, surfaceY: number, resolvesAt: number) => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createAttackOverlay = (scene: Scene, maxTiles: number): AttackOverlay => {
  const plateGeometry = new PlaneGeometry(PLATE_SIZE, PLATE_SIZE);
  // Plane is XY by default — rotate -90° around X so it lies on the XZ ground.
  plateGeometry.rotateX(-Math.PI * 0.5);

  const barGeometry = new BoxGeometry(X_BAR_LENGTH, X_BAR_HEIGHT, X_BAR_THICKNESS);

  const plateMaterial = new MeshBasicMaterial({
    color: new Color("#ff3838"),
    transparent: true,
    opacity: 0.36,
    depthWrite: false
  });
  const barMaterial = new MeshBasicMaterial({
    color: new Color("#ff5555"),
    transparent: true,
    opacity: 0.92,
    depthWrite: false
  });

  const plateMesh = new InstancedMesh(plateGeometry, plateMaterial, maxTiles);
  const barAMesh = new InstancedMesh(barGeometry, barMaterial, maxTiles);
  const barBMesh = new InstancedMesh(barGeometry, barMaterial, maxTiles);
  for (const m of [plateMesh, barAMesh, barBMesh]) {
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 6;
  }
  scene.add(plateMesh, barAMesh, barBMesh);

  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3(1, 1, 1);
  const barAQuaternion = new Quaternion().setFromEuler(new Euler(0, Math.PI * 0.25, 0, "XYZ"));
  const barBQuaternion = new Quaternion().setFromEuler(new Euler(0, -Math.PI * 0.25, 0, "XYZ"));

  // Tracked per instance for pulse alpha at commit time. Until the
  // browser supports per-instance material colors with alpha cleanly,
  // the whole material's opacity is set from the most-imminent target —
  // good enough for the visual cue.
  let count = 0;
  let nearestResolvesAt = Number.POSITIVE_INFINITY;

  const clear = (): void => {
    count = 0;
    nearestResolvesAt = Number.POSITIVE_INFINITY;
  };

  const addInstance = (worldX: number, worldZ: number, surfaceY: number, resolvesAt: number): void => {
    if (count >= maxTiles) return;
    if (resolvesAt < nearestResolvesAt) nearestResolvesAt = resolvesAt;

    position.set(worldX, surfaceY + PLATE_Y, worldZ);
    matrix.compose(position, new Quaternion(), scale);
    plateMesh.setMatrixAt(count, matrix);

    position.set(worldX, surfaceY + X_BAR_Y, worldZ);
    matrix.compose(position, barAQuaternion, scale);
    barAMesh.setMatrixAt(count, matrix);
    matrix.compose(position, barBQuaternion, scale);
    barBMesh.setMatrixAt(count, matrix);

    count += 1;
  };

  const commit = (): void => {
    plateMesh.count = count;
    barAMesh.count = count;
    barBMesh.count = count;
    plateMesh.instanceMatrix.needsUpdate = true;
    barAMesh.instanceMatrix.needsUpdate = true;
    barBMesh.instanceMatrix.needsUpdate = true;
  };

  // Per-frame opacity pulse; faster as the soonest attack approaches.
  const tick = (nowMs: number): void => {
    if (count === 0) return;
    const remainingMs = Math.max(0, nearestResolvesAt - nowMs);
    const periodMs = remainingMs < 1500 ? 220 : 540;
    const phase = (nowMs % periodMs) / periodMs;
    const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
    plateMaterial.opacity = 0.22 + pulse * 0.32;
    barMaterial.opacity = 0.7 + pulse * 0.28;
  };

  const dispose = (): void => {
    scene.remove(plateMesh, barAMesh, barBMesh);
    plateGeometry.dispose();
    barGeometry.dispose();
    plateMaterial.dispose();
    barMaterial.dispose();
  };

  return { clear, addInstance, commit, tick, dispose };
};

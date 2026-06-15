import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Scene,
  Vector3
} from "three";

// Breach border overlay: bright amber strips drawn on tile edges where an
// own tile borders a breached enemy tile (captureBreachUntil active).
// Two separate InstancedMesh instances handle N/S edges (horizontal strips)
// and E/W edges (vertical strips) so geometry never needs per-instance rotation.

const STRIP_LENGTH = 0.92; // spans most of the tile side
const STRIP_WIDTH = 0.10;  // thin edge indicator
const STRIP_Y = 0.032;     // just above ground

const HALF_TILE = 0.5; // world-space offset to the tile boundary (tile spacing = 1)

const AMBER = new Color("#ffb300");

export type BreachBorderOverlay = {
  readonly clear: () => void;
  /** Add a breach strip on the edge between (worldX, worldZ) and the given direction. */
  readonly addEdge: (worldX: number, worldZ: number, surfaceY: number, direction: "north" | "south" | "east" | "west") => void;
  readonly commit: () => void;
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createBreachBorderOverlay = (scene: Scene, maxEdges: number): BreachBorderOverlay => {
  // N/S edges: strip lies along X (length=X, width=Z)
  const hGeometry = new BoxGeometry(STRIP_LENGTH, STRIP_WIDTH * 0.4, STRIP_WIDTH);
  // E/W edges: strip lies along Z (length=Z, width=X)
  const vGeometry = new BoxGeometry(STRIP_WIDTH, STRIP_WIDTH * 0.4, STRIP_LENGTH);

  const material = new MeshBasicMaterial({
    color: AMBER,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });

  const hMesh = new InstancedMesh(hGeometry, material, maxEdges);
  const vMesh = new InstancedMesh(vGeometry, material, maxEdges);
  for (const m of [hMesh, vMesh]) {
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = 7;
  }
  scene.add(hMesh, vMesh);

  const matrix = new Matrix4();
  const pos = new Vector3();
  const identity = new Quaternion();
  const scale = new Vector3(1, 1, 1);

  let hCount = 0;
  let vCount = 0;

  const clear = (): void => {
    hCount = 0;
    vCount = 0;
  };

  const addEdge = (worldX: number, worldZ: number, surfaceY: number, direction: "north" | "south" | "east" | "west"): void => {
    const y = surfaceY + STRIP_Y;
    if (direction === "north") {
      if (hCount >= maxEdges) return;
      pos.set(worldX, y, worldZ - HALF_TILE);
      matrix.compose(pos, identity, scale);
      hMesh.setMatrixAt(hCount++, matrix);
    } else if (direction === "south") {
      if (hCount >= maxEdges) return;
      pos.set(worldX, y, worldZ + HALF_TILE);
      matrix.compose(pos, identity, scale);
      hMesh.setMatrixAt(hCount++, matrix);
    } else if (direction === "east") {
      if (vCount >= maxEdges) return;
      pos.set(worldX + HALF_TILE, y, worldZ);
      matrix.compose(pos, identity, scale);
      vMesh.setMatrixAt(vCount++, matrix);
    } else {
      if (vCount >= maxEdges) return;
      pos.set(worldX - HALF_TILE, y, worldZ);
      matrix.compose(pos, identity, scale);
      vMesh.setMatrixAt(vCount++, matrix);
    }
  };

  const commit = (): void => {
    hMesh.count = hCount;
    vMesh.count = vCount;
    hMesh.instanceMatrix.needsUpdate = true;
    vMesh.instanceMatrix.needsUpdate = true;
  };

  const tick = (nowMs: number): void => {
    if (hCount === 0 && vCount === 0) return;
    const phase = (nowMs % 900) / 900;
    const pulse = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
    material.opacity = 0.55 + pulse * 0.40;
  };

  const dispose = (): void => {
    scene.remove(hMesh, vMesh);
    hGeometry.dispose();
    vGeometry.dispose();
    material.dispose();
  };

  return { clear, addEdge, commit, tick, dispose };
};

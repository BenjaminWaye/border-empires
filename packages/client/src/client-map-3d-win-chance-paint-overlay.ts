import { Color, DoubleSide, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Scene } from "three";

// Workstream F0 (docs/replenishment-update-plan.md): win-chance map paint,
// 3D renderer only. Paints a flat tinted plane over the currently-armed
// MARCH target tile and its neighbors, colored by winChanceForTile's
// red->amber->green gradient (packages/shared/src/frontier-combat/
// frontier-combat-win-chance-paint.ts). Follows the same
// clear/add/commit/tick/dispose shape every overlay in client-map-3d.ts
// uses (see client-map-3d-muster-overlay.ts), and the same flat-tinted-
// plane-via-instanceColor technique client-map-3d-selection-range-overlays
// uses for its fill rings, scaled down to one entry per tile instead of a
// ring mesh.
//
// F0 SCOPE NOTE: this overlay exists ONLY on the true-3D renderer
// (isTrue3DRendererActive()) — the 2D canvas renderer (the accessibility
// fallback for players whose devices can't run 3D, per AGENTS.md) has no
// win-chance paint yet. That's a separate follow-up (F4), not silently
// dropped: winChanceForTile itself is renderer-agnostic (plain data in,
// color/number out) specifically so the 2D wiring can reuse it unchanged.
const MAX_TILES = 9; // 1 target + 8 neighbors (see client-win-chance-paint-trigger.ts)
const PLANE_RISE_ABOVE_HEIGHTFIELD = 0.011; // just under marker rise (0.012) so it never z-fights selection markers

export type WinChancePaintEntry = {
  sceneX: number;
  sceneZ: number;
  surfaceY: number;
  color: string;
};

export type WinChancePaintOverlay = {
  readonly clear: () => void;
  readonly addTile: (entry: WinChancePaintEntry) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createWinChancePaintOverlay = (scene: Scene): WinChancePaintOverlay => {
  const geometry = new PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    toneMapped: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide
  });
  const mesh = new InstancedMesh(geometry, material, MAX_TILES);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 22; // alongside the selection-range reach ring (20-21)
  scene.add(mesh);

  let entries: WinChancePaintEntry[] = [];
  const tmpColor = new Color();

  const clear = (): void => { entries = []; };

  const addTile = (entry: WinChancePaintEntry): void => {
    if (entries.length >= MAX_TILES) return;
    entries.push(entry);
  };

  const commit = (): void => {
    mesh.count = entries.length;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      mesh.setMatrixAt(i, tmpMatrixAt(e.sceneX, e.surfaceY + PLANE_RISE_ABOVE_HEIGHTFIELD, e.sceneZ));
      tmpColor.set(e.color);
      mesh.setColorAt(i, tmpColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { clear, addTile, commit, dispose };
};

// Local throwaway Object3D-free matrix builder (avoids importing/allocating
// a shared Object3D dummy just for a static, unrotated, unscaled translate).
const tmpMatrix = new Matrix4();
const tmpMatrixAt = (x: number, y: number, z: number): Matrix4 => tmpMatrix.makeTranslation(x, y, z);

import { AdditiveBlending, DynamicDrawUsage, Group, InstancedMesh, Matrix4, MeshBasicMaterial, RingGeometry, Scene } from "three";

// True-3D counterpart to drawOnboardingChecklistHighlights (the 2D canvas
// ring). The 2D version projects tile coordinates through the flat
// isometric worldToScreen math, which has no relationship to the 3D
// camera/terrain — in true-3D mode that produced a ring floating at an
// arbitrary screen position instead of sitting on the highlighted tile.
// This draws a real ring mesh on the ground plane at each tile's actual
// scene position/height instead.

const MAX_MARKERS = 32;
// Wide enough to peek out from under a settled town's footprint/buildings
// (which cover most of a tile's ~0.94-unit footprint -- see
// client-map-3d-settle-overlay.ts's TINT_SIZE) instead of being fully
// hidden beneath it once the highlighted tile grows a town.
const RING_INNER = 0.58;
const RING_OUTER = 0.7;

export type OnboardingChecklistHighlightTile = { readonly sceneX: number; readonly sceneZ: number; readonly surfaceY: number };

export type OnboardingChecklistHighlightOverlay = {
  readonly sync: (tiles: readonly OnboardingChecklistHighlightTile[], nowMs: number) => void;
  readonly dispose: () => void;
};

export const createOnboardingChecklistHighlightOverlay = (scene: Scene): OnboardingChecklistHighlightOverlay => {
  const group = new Group();
  group.name = "onboarding-checklist-highlight-overlay";
  scene.add(group);

  const geometry = new RingGeometry(RING_INNER, RING_OUTER, 28);
  geometry.rotateX(-Math.PI * 0.5);
  const material = new MeshBasicMaterial({
    toneMapped: false,
    color: "#7ee08a",
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false
  });
  const mesh = new InstancedMesh(geometry, material, MAX_MARKERS);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  group.add(mesh);

  const matrix = new Matrix4();

  const sync = (tiles: readonly OnboardingChecklistHighlightTile[], nowMs: number): void => {
    const pulseScale = 1 + Math.sin(nowMs / 320) * 0.12;
    const count = Math.min(tiles.length, MAX_MARKERS);
    for (let i = 0; i < count; i += 1) {
      const tile = tiles[i]!;
      matrix.makeScale(pulseScale, 1, pulseScale);
      matrix.setPosition(tile.sceneX, tile.surfaceY, tile.sceneZ);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.count = count;
    material.opacity = 0.55 + Math.sin(nowMs / 320) * 0.25;
    if (count > 0) {
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    geometry.dispose();
    material.dispose();
  };

  return { sync, dispose };
};

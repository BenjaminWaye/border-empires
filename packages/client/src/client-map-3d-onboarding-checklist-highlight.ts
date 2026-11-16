import { AdditiveBlending, BufferGeometry, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Group, InstancedMesh, Matrix4, MeshBasicMaterial, RingGeometry, Scene } from "three";

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
// Dark halo under the ring and four inward arrowheads, matching the 2D marker
// (client-onboarding-checklist-highlight.ts): the pale-green ring alone was
// lost on pale land for a deuteranope (playtest 2026-11-12).
const HALO_INNER = 0.53;
const HALO_OUTER = 0.76;
const CHEVRON_TIP = 0.8;
const CHEVRON_DEPTH = 0.2;
const CHEVRON_HALF_WIDTH = 0.14;

/** Four flat triangles on the ground plane, each pointing in at the tile centre. */
export const createGuideChevronGeometry = (): BufferGeometry => {
  const positions: number[] = [];
  for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
    const base = CHEVRON_TIP + CHEVRON_DEPTH;
    positions.push(
      dx * CHEVRON_TIP, 0.002, dz * CHEVRON_TIP,
      dx * base - dz * CHEVRON_HALF_WIDTH, 0.002, dz * base + dx * CHEVRON_HALF_WIDTH,
      dx * base + dz * CHEVRON_HALF_WIDTH, 0.002, dz * base - dx * CHEVRON_HALF_WIDTH
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
};

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
  const haloGeometry = new RingGeometry(HALO_INNER, HALO_OUTER, 28);
  haloGeometry.rotateX(-Math.PI * 0.5);
  const haloMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#0c140e", transparent: true, opacity: 0.6, depthWrite: false });
  const chevronGeometry = createGuideChevronGeometry();
  const chevronMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#7ee08a", transparent: true, opacity: 0.95, side: DoubleSide, depthWrite: false });
  const createMarkerMesh = (markerGeometry: BufferGeometry, markerMaterial: MeshBasicMaterial, renderOrder: number): InstancedMesh => {
    const markerMesh = new InstancedMesh(markerGeometry, markerMaterial, MAX_MARKERS);
    markerMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    markerMesh.count = 0;
    markerMesh.frustumCulled = false;
    markerMesh.renderOrder = renderOrder;
    return markerMesh;
  };
  // The ring stays the group's first child; halo draws beneath it, arrowheads on top.
  const mesh = createMarkerMesh(geometry, material, 1);
  const haloMesh = createMarkerMesh(haloGeometry, haloMaterial, 0);
  const chevronMesh = createMarkerMesh(chevronGeometry, chevronMaterial, 2);
  const meshes = [mesh, haloMesh, chevronMesh];
  group.add(...meshes);

  const matrix = new Matrix4();

  const sync = (tiles: readonly OnboardingChecklistHighlightTile[], nowMs: number): void => {
    const pulseScale = 1 + Math.sin(nowMs / 320) * 0.12;
    const count = Math.min(tiles.length, MAX_MARKERS);
    for (let i = 0; i < count; i += 1) {
      const tile = tiles[i]!;
      matrix.makeScale(pulseScale, 1, pulseScale);
      matrix.setPosition(tile.sceneX, tile.surfaceY, tile.sceneZ);
      for (const markerMesh of meshes) markerMesh.setMatrixAt(i, matrix);
    }
    material.opacity = 0.55 + Math.sin(nowMs / 320) * 0.25;
    for (const markerMesh of meshes) {
      markerMesh.count = count;
      if (count > 0) {
        markerMesh.instanceMatrix.clearUpdateRanges();
        markerMesh.instanceMatrix.addUpdateRange(0, count * 16);
        markerMesh.instanceMatrix.needsUpdate = true;
      }
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    for (const markerMesh of meshes) {
      markerMesh.geometry.dispose();
      (markerMesh.material as MeshBasicMaterial).dispose();
    }
  };

  return { sync, dispose };
};

import { ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, Scene } from "three";

// Workstream F1 (docs/replenishment-update-plan.md): the 3D visual for the
// right-click-drag arrow gesture (client-map-input-arrow-gesture.ts drives
// the state; client-map-3d/client-map-3d.ts feeds this overlay the two
// endpoints' already-toroid-wrapped scene positions each frame, the same way
// it feeds client-map-3d-win-chance-paint-overlay.ts). Follows the same
// clear/set.../commit/dispose shape client-map-3d-muster-transit-overlay.ts
// and client-map-3d-win-chance-paint-overlay.ts use: a fixed-size pool of
// meshes created once and added to the scene, then repositioned/hidden every
// frame rather than recreated.
//
// A straight shaft (cylinder) plus an arrowhead (cone) at the target end,
// both length-aligned along their LOCAL +Z axis so a single Group rotation
// (yaw around Y) orients the whole arrow toward the target -- no per-frame
// geometry rebuild, just position/rotation/scale.

const SHAFT_RADIUS = 0.06;
const HEAD_RADIUS = 0.17;
const HEAD_LENGTH = 0.34;
const RISE_ABOVE_HEIGHTFIELD = 0.02; // just under win-chance paint's plane (0.011 above corners, but this sits on the higher of the two endpoints) so it renders above the paint, not fighting it
const ARROW_COLOR = "#ffd54a";

export type ArrowOverlayEndpoint = { sceneX: number; sceneZ: number; surfaceY: number };

export type ArrowOverlay = {
  readonly clear: () => void;
  readonly setEndpoints: (from: ArrowOverlayEndpoint, to: ArrowOverlayEndpoint) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createArrowOverlay = (scene: Scene): ArrowOverlay => {
  const material = new MeshBasicMaterial({ color: ARROW_COLOR, toneMapped: false, depthTest: false, depthWrite: false });

  // Shaft: unit-length cylinder along local +Z, running from z=0 to z=1 --
  // scaled on Z each commit() to the actual (shaft-only, head excluded) span.
  const shaftGeometry = new CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, 1, 8);
  shaftGeometry.rotateX(Math.PI / 2);
  shaftGeometry.translate(0, 0, 0.5);
  const shaft = new Mesh(shaftGeometry, material);

  // Head: cone along local +Z, base at z=0 and apex at z=HEAD_LENGTH --
  // positioned at the end of the (scaled) shaft each commit().
  const headGeometry = new ConeGeometry(HEAD_RADIUS, HEAD_LENGTH, 10);
  headGeometry.rotateX(Math.PI / 2);
  headGeometry.translate(0, 0, HEAD_LENGTH / 2);
  const head = new Mesh(headGeometry, material);

  const group = new Group();
  group.add(shaft);
  group.add(head);
  group.visible = false;
  group.renderOrder = 23; // above win-chance paint's plane (22)
  scene.add(group);

  let pending: { from: ArrowOverlayEndpoint; to: ArrowOverlayEndpoint } | undefined;

  const clear = (): void => { pending = undefined; };

  const setEndpoints = (from: ArrowOverlayEndpoint, to: ArrowOverlayEndpoint): void => {
    pending = { from, to };
  };

  const commit = (): void => {
    if (!pending) { group.visible = false; return; }
    const { from, to } = pending;
    const dx = to.sceneX - from.sceneX;
    const dz = to.sceneZ - from.sceneZ;
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) { group.visible = false; return; }

    const y = Math.max(from.surfaceY, to.surfaceY) + RISE_ABOVE_HEIGHTFIELD;
    group.position.set(from.sceneX, y, from.sceneZ);
    // Local +Z (0,0,1) rotated by Ry(yaw) lands at (sin(yaw), 0, cos(yaw)) --
    // solved for it to equal the normalized (dx, dz) direction.
    group.rotation.set(0, Math.atan2(dx, dz), 0);

    const shaftLength = Math.max(0, length - HEAD_LENGTH);
    shaft.scale.set(1, 1, shaftLength);
    head.position.set(0, 0, shaftLength);
    group.visible = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    shaftGeometry.dispose();
    headGeometry.dispose();
    material.dispose();
  };

  return { clear, setEndpoints, commit, dispose };
};

/**
 * Per-render-frame sync helper: clears, sets endpoints (if a drag is in
 * progress) and commits in one call, so client-map-3d/client-map-3d.ts's
 * renderLoop (already well over the repo's file-line cap) only needs a
 * single call site rather than this whole clear/set/commit sequence inline.
 */
export const syncArrowOverlayFrame = (
  overlay: ArrowOverlay,
  arrowGesture: { origin: { x: number; y: number }; target: { x: number; y: number } } | undefined,
  sceneFor: (tile: { x: number; y: number }) => ArrowOverlayEndpoint
): void => {
  overlay.clear();
  if (arrowGesture) overlay.setEndpoints(sceneFor(arrowGesture.origin), sceneFor(arrowGesture.target));
  overlay.commit();
};

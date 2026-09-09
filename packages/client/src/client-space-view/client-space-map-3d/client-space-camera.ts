// Camera + OrbitControls setup, split out from the scene assembler so it can
// change independently (e.g. zoom clamps) without touching mesh/starfield
// code, matching the module-per-concern split used across client-map-3d-*.
//
// Navigation model (per user request): the galaxy is a wide, fixed-origin
// orbit by default (see GALAXY_VIEW_DISTANCE); clicking a system flies the
// camera to it (see flyTo) so you can then freely orbit/zoom around that
// one system; resetView flies back out to the wide galaxy view. This is a
// "focus and orbit" model, not free-fly -- deliberate, since the galaxy is
// really just a set of a few dozen discrete points, not open space worth
// wandering through.
import { PerspectiveCamera, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Vec3 } from "../client-space-view-state.js";

export const GALAXY_VIEW_TARGET: Vec3 = { x: 0, y: 0, z: 0 };
// Matches the rig's initial camera.position (0, 20, 90) -- same distance,
// so resetView() lands exactly where the scene starts out.
export const GALAXY_VIEW_DISTANCE = Math.hypot(20, 90);
// Close enough to fill the screen with one system's sun + orbiting bodies
// (the solar-system factory's decoratives extend out to roughly radius 12)
// without clipping into them.
export const FOCUS_VIEW_DISTANCE = 16;
const FLIGHT_DURATION_MS = 700;

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Flight = {
  startCameraPos: Vector3;
  endCameraPos: Vector3;
  startTarget: Vector3;
  endTarget: Vector3;
  startedAtMs: number;
};

export type SpaceCameraRig = {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  // Animates the camera to `distance` away from `focusPosition`, along the
  // camera's *current* viewing direction (so the flight preserves whatever
  // angle you were already looking from, rather than snapping to a fixed
  // angle) -- feels like flying in, not cutting to a different shot.
  flyTo: (focusPosition: Vec3, distance: number) => void;
  // Flies back out to the default wide galaxy view.
  resetView: () => void;
  // Advances any in-progress flight. Call once per animation frame, before
  // controls.update() -- a no-op when no flight is active.
  tick: () => void;
  dispose: () => void;
};

export const createSpaceCameraRig = (canvas: HTMLCanvasElement, aspect: number): SpaceCameraRig => {
  const camera = new PerspectiveCamera(55, aspect, 0.1, 2000);
  camera.position.set(0, 20, 90);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Lower bound loosened from the old fixed-origin-only rig (15) so a
  // focused system can be orbited up close; upper bound covers the full
  // galaxy layout's radius-40 shell plus room to pull back further.
  controls.minDistance = 3;
  controls.maxDistance = 400;
  controls.enablePan = false;
  controls.target.set(GALAXY_VIEW_TARGET.x, GALAXY_VIEW_TARGET.y, GALAXY_VIEW_TARGET.z);
  controls.update();

  let flight: Flight | undefined;

  const flyTo = (focusPosition: Vec3, distance: number): void => {
    const target = new Vector3(focusPosition.x, focusPosition.y, focusPosition.z);
    // Preserve the current viewing angle: keep flying in from the same
    // direction the camera is already looking from, just closer/farther.
    const direction = camera.position.clone().sub(controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(0, 0.3, 1); // degenerate (camera exactly at target) -- pick a stable default angle
    direction.normalize();
    const endCameraPos = target.clone().addScaledVector(direction, distance);

    controls.enabled = false; // don't let a drag mid-flight fight the tween
    flight = {
      startCameraPos: camera.position.clone(),
      endCameraPos,
      startTarget: controls.target.clone(),
      endTarget: target,
      startedAtMs: performance.now()
    };
  };

  const resetView = (): void => flyTo(GALAXY_VIEW_TARGET, GALAXY_VIEW_DISTANCE);

  const tick = (): void => {
    if (!flight) return;
    const t = Math.min(1, (performance.now() - flight.startedAtMs) / FLIGHT_DURATION_MS);
    const eased = easeInOutCubic(t);
    camera.position.lerpVectors(flight.startCameraPos, flight.endCameraPos, eased);
    controls.target.lerpVectors(flight.startTarget, flight.endTarget, eased);
    if (t >= 1) {
      flight = undefined;
      controls.enabled = true;
    }
  };

  return {
    camera,
    controls,
    flyTo,
    resetView,
    tick,
    dispose: () => controls.dispose()
  };
};

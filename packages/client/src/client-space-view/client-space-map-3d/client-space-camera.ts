// Camera + OrbitControls setup, split out from the scene assembler so it can
// change independently (e.g. zoom clamps) without touching mesh/starfield
// code, matching the module-per-concern split used across client-map-3d-*.
import { PerspectiveCamera } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type SpaceCameraRig = {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  dispose: () => void;
};

export const createSpaceCameraRig = (canvas: HTMLCanvasElement, aspect: number): SpaceCameraRig => {
  const camera = new PerspectiveCamera(55, aspect, 0.1, 2000);
  camera.position.set(0, 20, 90);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 15;
  controls.maxDistance = 400;
  controls.enablePan = false;
  controls.target.set(0, 0, 0);
  controls.update();

  return {
    camera,
    controls,
    dispose: () => controls.dispose()
  };
};

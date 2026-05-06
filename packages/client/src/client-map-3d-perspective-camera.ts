import { PerspectiveCamera, Vector3 } from "three";

export const PERSPECTIVE_FOV_DEGREES = 45;
export const PERSPECTIVE_NEAR = 0.1;
export const PERSPECTIVE_FAR = 4000;
export const PERSPECTIVE_TILT_RADIANS = 0.6;
export const PERSPECTIVE_REFERENCE_ZOOM = 32;
export const PERSPECTIVE_REFERENCE_DISTANCE = 26;
export const PERSPECTIVE_TILE_CENTER_OFFSET = 0.5;

export type PerspectiveCameraStateInputs = {
  readonly zoom: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
};

export const createPerspectiveCamera = (canvas: HTMLCanvasElement): PerspectiveCamera => {
  const aspect = Math.max(1, canvas.width) / Math.max(1, canvas.height);
  const camera = new PerspectiveCamera(PERSPECTIVE_FOV_DEGREES, aspect, PERSPECTIVE_NEAR, PERSPECTIVE_FAR);
  return camera;
};

const target = new Vector3();

export const cameraDistanceForZoom = (zoom: number): number => {
  const safeZoom = Math.max(1, zoom);
  return PERSPECTIVE_REFERENCE_DISTANCE * (PERSPECTIVE_REFERENCE_ZOOM / safeZoom);
};

export const applyPerspectiveCamera = (
  camera: PerspectiveCamera,
  inputs: PerspectiveCameraStateInputs
): void => {
  const width = Math.max(1, inputs.canvasWidth);
  const height = Math.max(1, inputs.canvasHeight);
  camera.aspect = width / height;
  const distance = cameraDistanceForZoom(inputs.zoom);
  const centerX = PERSPECTIVE_TILE_CENTER_OFFSET;
  const centerZ = PERSPECTIVE_TILE_CENTER_OFFSET;
  camera.position.set(
    centerX,
    distance * Math.cos(PERSPECTIVE_TILT_RADIANS),
    centerZ + distance * Math.sin(PERSPECTIVE_TILT_RADIANS)
  );
  target.set(centerX, 0, centerZ);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
};

import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";

export const POINTER_PICK_TILE_CENTER_OFFSET = 0.5;
const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);

export type PointerPickStateInputs = {
  readonly camX: number;
  readonly camY: number;
};

export type PointerPickDeps = {
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  readonly state: PointerPickStateInputs;
  readonly worldWidth: number;
  readonly worldHeight: number;
};

export type PointerPick = {
  readonly worldTileRawFromPointer: (offsetX: number, offsetY: number) => { gx: number; gy: number };
  readonly worldToScreen: (wx: number, wy: number) => { sx: number; sy: number };
};

export const toroidDelta = (from: number, to: number, dim: number): number => {
  let delta = to - from;
  if (delta > dim / 2) delta -= dim;
  if (delta < -dim / 2) delta += dim;
  return delta;
};

export const createPointerPick = (deps: PointerPickDeps): PointerPick => {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const hit = new Vector3();
  const projected = new Vector3();

  const worldTileRawFromPointer = (offsetX: number, offsetY: number): { gx: number; gy: number } => {
    const width = Math.max(1, deps.canvas.width);
    const height = Math.max(1, deps.canvas.height);
    ndc.set((offsetX / width) * 2 - 1, -((offsetY / height) * 2 - 1));
    raycaster.setFromCamera(ndc, deps.camera);
    const intersection = raycaster.ray.intersectPlane(GROUND_PLANE, hit);
    if (!intersection) {
      return { gx: deps.state.camX, gy: deps.state.camY };
    }
    return {
      gx: deps.state.camX + Math.floor(hit.x),
      gy: deps.state.camY + Math.floor(hit.z)
    };
  };

  const worldToScreen = (wx: number, wy: number): { sx: number; sy: number } => {
    const dx = toroidDelta(deps.state.camX, wx, deps.worldWidth) + POINTER_PICK_TILE_CENTER_OFFSET;
    const dy = toroidDelta(deps.state.camY, wy, deps.worldHeight) + POINTER_PICK_TILE_CENTER_OFFSET;
    projected.set(dx, 0, dy).project(deps.camera);
    return {
      sx: (projected.x * 0.5 + 0.5) * deps.canvas.width,
      sy: (-projected.y * 0.5 + 0.5) * deps.canvas.height
    };
  };

  return { worldTileRawFromPointer, worldToScreen };
};

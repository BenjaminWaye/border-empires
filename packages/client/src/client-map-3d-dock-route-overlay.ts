import {
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineDashedMaterial,
  Scene
} from "three";
import { WATER_SURFACE_Y } from "./client-map-3d-water-surface.js";

// True-3D counterpart of client-dock-route-draw.ts's 2D dashed sea-route
// line. Each route is one continuous Three.js Line (not one Line per hop) so
// the dash pattern runs unbroken along the whole route; the caller unwraps
// the route across the toroidal seam before handing points over (see
// client-map-3d-dock-route-sync.ts).
//
// Every point sits at a flat height just above the water surface. Routes
// only ever cross sea, and sampling the heightfield instead made the line
// jump wherever the route left the loaded terrain window (heightfield
// elevation reads 0 there vs ~-0.16..-0.36 for loaded sea), which read as
// the line "breaking" while following it to a far dock.
export type DockRouteOverlay = {
  clear: () => void;
  addPath: (points: ReadonlyArray<{ x: number; z: number }>) => void;
  commit: () => void;
  tick: (nowMs: number) => void;
  dispose: () => void;
};

const ROUTE_Y = WATER_SURFACE_Y + 0.05;
const DASH_SIZE = 0.16;
const GAP_SIZE = 0.13;
const DASH_COLOR = "#fff6b0";

export const createDockRouteOverlay = (scene: Scene): DockRouteOverlay => {
  const activeLines: Array<{ line: Line; mat: LineDashedMaterial }> = [];
  const pending: Array<ReadonlyArray<{ x: number; z: number }>> = [];

  const clear = (): void => {
    for (const { line, mat } of activeLines) {
      scene.remove(line);
      line.geometry.dispose();
      mat.dispose();
    }
    activeLines.length = 0;
    pending.length = 0;
  };

  const addPath = (points: ReadonlyArray<{ x: number; z: number }>): void => {
    if (points.length >= 2) pending.push(points);
  };

  const commit = (): void => {
    for (const points of pending) {
      const positions: number[] = [];
      for (const point of points) positions.push(point.x, ROUTE_Y, point.z);
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
      const mat = new LineDashedMaterial({
        color: DASH_COLOR,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
        dashSize: DASH_SIZE,
        gapSize: GAP_SIZE
      });
      const line = new Line(geo, mat);
      line.computeLineDistances();
      line.renderOrder = 37;
      scene.add(line);
      activeLines.push({ line, mat });
    }
    pending.length = 0;
  };

  const tick = (nowMs: number): void => {
    // three's LineDashedMaterial has no dashOffset uniform to animate a
    // marching-ants scroll (unlike the 2D canvas's ctx.lineDashOffset), so
    // this pulses opacity instead -- same "alive" cue the 2D line's motion
    // gives, without needing a custom shader.
    const opacity = 0.75 + 0.2 * Math.abs(Math.sin(nowMs / 400));
    for (const { mat } of activeLines) {
      mat.opacity = opacity;
      mat.needsUpdate = true;
    }
  };

  const dispose = (): void => {
    clear();
  };

  return { clear, addPath, commit, tick, dispose };
};

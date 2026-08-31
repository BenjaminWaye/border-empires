import {
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineDashedMaterial,
  Scene
} from "three";

// True-3D counterpart of client-dock-route-draw.ts's 2D dashed sea-route
// line. Drawn as one Three.js Line per hop (not one polyline for the whole
// route) so a hop that crosses the toroidal world seam can simply be
// skipped by the caller instead of drawing a line across the whole map --
// mirroring the 2D renderer's per-segment wrap check in client-runtime-loop.ts.
export type DockRouteOverlay = {
  clear: () => void;
  addSegment: (
    fromX: number, fromZ: number, fromSurfaceY: number,
    toX: number, toZ: number, toSurfaceY: number
  ) => void;
  commit: () => void;
  tick: (nowMs: number) => void;
  dispose: () => void;
};

const FLOAT_ABOVE = 0.05;
const DASH_SIZE = 0.16;
const GAP_SIZE = 0.13;
const DASH_COLOR = "#fff6b0";

type PendingSegment = { fromX: number; fromY: number; fromZ: number; toX: number; toY: number; toZ: number };

export const createDockRouteOverlay = (scene: Scene): DockRouteOverlay => {
  const activeLines: Array<{ line: Line; mat: LineDashedMaterial }> = [];
  const pending: PendingSegment[] = [];

  const clear = (): void => {
    for (const { line, mat } of activeLines) {
      scene.remove(line);
      line.geometry.dispose();
      mat.dispose();
    }
    activeLines.length = 0;
    pending.length = 0;
  };

  const addSegment = (
    fromX: number, fromZ: number, fromSurfaceY: number,
    toX: number, toZ: number, toSurfaceY: number
  ): void => {
    pending.push({ fromX, fromY: fromSurfaceY + FLOAT_ABOVE, fromZ, toX, toY: toSurfaceY + FLOAT_ABOVE, toZ });
  };

  const commit = (): void => {
    for (const p of pending) {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute([
        p.fromX, p.fromY, p.fromZ,
        p.toX, p.toY, p.toZ
      ], 3));
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

  return { clear, addSegment, commit, tick, dispose };
};

import { describe, expect, it } from "vitest";
import { applyPerspectiveCamera, createPerspectiveCamera } from "./client-map-3d-perspective-camera.js";
import { createPointerPick } from "./client-map-3d-pointer-pick.js";

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const WORLD_WIDTH = 450;
const WORLD_HEIGHT = 450;

const makeCanvas = (): HTMLCanvasElement => {
  const canvas = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } as HTMLCanvasElement;
  return canvas;
};

const setupPick = (camX: number, camY: number, zoom: number) => {
  const canvas = makeCanvas();
  const camera = createPerspectiveCamera(canvas);
  applyPerspectiveCamera(camera, { zoom, canvasWidth: canvas.width, canvasHeight: canvas.height });
  const state = { camX, camY };
  return createPointerPick({ camera, canvas, state, worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT });
};

describe("3d perspective pointer pick", () => {
  it("returns the camera tile when the pointer is at the canvas center", () => {
    for (const zoom of [12, 32, 64, 128]) {
      for (const camX of [0, 50, 200, 449]) {
        for (const camY of [0, 100, 300]) {
          const pick = setupPick(camX, camY, zoom);
          const { gx, gy } = pick.worldTileRawFromPointer(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
          expect(gx).toBe(camX);
          expect(gy).toBe(camY);
        }
      }
    }
  });

  it("projects the camera tile center to the canvas center", () => {
    for (const zoom of [12, 32, 64, 128]) {
      for (const camX of [0, 50, 200, 449]) {
        const pick = setupPick(camX, 100, zoom);
        const { sx, sy } = pick.worldToScreen(camX, 100);
        expect(Math.abs(sx - CANVAS_WIDTH / 2)).toBeLessThan(1);
        expect(Math.abs(sy - CANVAS_HEIGHT / 2)).toBeLessThan(1);
      }
    }
  });

  it("round-trips tile centers through worldToScreen → worldTileRawFromPointer", () => {
    const pick = setupPick(225, 225, 32);
    for (const dx of [-3, -1, 0, 1, 3, 5]) {
      for (const dy of [-3, -1, 0, 1, 3]) {
        const wx = 225 + dx;
        const wy = 225 + dy;
        const { sx, sy } = pick.worldToScreen(wx, wy);
        const { gx, gy } = pick.worldTileRawFromPointer(sx, sy);
        expect(gx).toBe(wx);
        expect(gy).toBe(wy);
      }
    }
  });

  it("handles toroidal wrap when the camera sits on the world seam", () => {
    const pick = setupPick(0, 0, 32);
    const { sx, sy } = pick.worldToScreen(WORLD_WIDTH - 1, WORLD_HEIGHT - 1);
    const { gx, gy } = pick.worldTileRawFromPointer(sx, sy);
    expect(gx).toBe(-1);
    expect(gy).toBe(-1);
  });

  it("returns a finite tile when the pointer ray is parallel to the ground (degenerate)", () => {
    const pick = setupPick(50, 50, 32);
    const { gx, gy } = pick.worldTileRawFromPointer(0, 0);
    expect(Number.isFinite(gx)).toBe(true);
    expect(Number.isFinite(gy)).toBe(true);
  });
});

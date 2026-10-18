import { describe, expect, it, vi } from "vitest";
import { Scene, LineSegments, Mesh } from "three";
import { createInitialState } from "../client-state/client-state.js";
import { setTrue3DRendererActive } from "../client-renderer-mode.js";
import { createGarrisonSelection3D } from "./client-garrison-many-3d.js";
import { drawMapSelection2D } from "./client-map-selection-2d.js";

const stateWithSelection = () => {
  const state = createInitialState();
  state.garrisonMany.active = true;
  state.garrisonMany.keys = ["3,4", "4,4"];
  state.garrisonMany.invalidKeys = ["4,4"];
  return state;
};
describe("Garrison Many renderer parity", () => {
  it("draws valid and invalid canvas selections, and respects the 3D guard", () => {
    const state = stateWithSelection();
    const ctx = {
      save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(),
      fillStyle: "", strokeStyle: "", lineWidth: 1
    };
    const deps = { ctx: ctx as unknown as CanvasRenderingContext2D, keyFor: (x: number, y: number) => `${x},${y}`,
      isTownSupportNeighbor: () => false, isTownSupportHighlightableTile: () => false };
    setTrue3DRendererActive(false);
    drawMapSelection2D(state, deps, 3, 4, undefined, 10, 10, 30, undefined);
    expect(ctx.fillRect).toHaveBeenCalledOnce();
    expect(ctx.strokeStyle).toBe("#ffd166");
    drawMapSelection2D(state, deps, 4, 4, undefined, 10, 10, 30, undefined);
    expect(ctx.strokeStyle).toBe("#ff8a3d");
    setTrue3DRendererActive(true);
    drawMapSelection2D(state, deps, 3, 4, undefined, 10, 10, 30, undefined);
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    setTrue3DRendererActive(false);
  });
  it("places both 3D outlines/fills against terrain, follows scene origin and removes them on cancel", () => {
    const state = stateWithSelection();
    const scene = new Scene();
    const overlay = createGarrisonSelection3D(scene);
    const deps = { sceneOrigin: { camX: 0, camY: 0 }, wrapX: (x: number) => x, wrapY: (y: number) => y,
      cornerYAt: (x: number, y: number) => x + y, toroidDelta: (from: number, to: number) => to - from };
    overlay.sync(state.garrisonMany, deps);
    const lines = scene.children.filter((child): child is LineSegments => child instanceof LineSegments && child.visible);
    const fills = scene.children.filter((child): child is Mesh => child instanceof Mesh && child.visible);
    expect(lines).toHaveLength(2); expect(fills).toHaveLength(2);
    const first = lines[0]!.geometry.getAttribute("position");
    expect(first.getY(0)).toBeCloseTo(7.02);
    expect(first.getY(1)).toBeCloseTo(8.02);
    const initialX = first.getX(0);
    deps.sceneOrigin.camX = 2;
    overlay.sync(state.garrisonMany, deps);
    expect(first.getX(0)).toBeCloseTo(initialX - 2);
    state.garrisonMany.active = false;
    overlay.sync(state.garrisonMany, deps);
    expect(scene.children.some((child) => child.visible)).toBe(false);
    overlay.dispose(); expect(scene.children).toHaveLength(0);
  });
});

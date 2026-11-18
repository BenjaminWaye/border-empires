import { Mesh, MeshBasicMaterial, Scene } from "three";
import { describe, expect, it, vi } from "vitest";
import { createTownSupportTileOverlay } from "../client-map-3d-town-support-tile/client-map-3d-town-support-tile.js";
import { drawTownSupportPlot2D } from "../client-map-2d-town-support-tile-overlay.js";
import { PLOT_AMBER, PLOT_HALF, PLOT_IVORY, PLOT_LEG, PLOT_VERTICES } from "./plot-style.js";

it("draws only four open corners and a small diamond, with no solid pad or vertical hatch walls", () => {
  const overlay = createTownSupportTileOverlay(new Scene(), 24);
  overlay.addInstance(10, 20, Float32Array.from(PLOT_VERTICES, () => 0.12), false);
  overlay.commit();
  expect(overlay.group.children).toHaveLength(1);
  const mesh = overlay.group.children[0];
  expect(mesh).toBeInstanceOf(Mesh);
  if (!(mesh instanceof Mesh)) throw new Error("missing mesh");
  expect(mesh.material).toBeInstanceOf(MeshBasicMaterial);
  expect(mesh.geometry.drawRange.count).toBe(PLOT_VERTICES.length);
  const position = mesh.geometry.getAttribute("position");
  for (let i = 0; i < PLOT_VERTICES.length; i += 1) {
    expect(position.getY(i)).toBeCloseTo(0.12);
    const x = Math.abs(position.getX(i) - 10), z = Math.abs(position.getZ(i) - 20);
    // Only the tiny central diamond may enter the open interior.
    if (i < PLOT_VERTICES.length - 6) {
      expect(Math.max(x, z)).toBeGreaterThanOrEqual(PLOT_HALF - 0.026);
      expect(Math.min(x, z)).toBeGreaterThanOrEqual(PLOT_HALF - PLOT_LEG - 0.001);
    }
  }
  const before = position.version;
  overlay.clear(); overlay.commit();
  expect(mesh.geometry.drawRange.count).toBe(0);
  overlay.addInstance(10, 20, Float32Array.from(PLOT_VERTICES, () => 0.2), true); overlay.commit();
  expect(position.version).toBeGreaterThan(before);
  const color = mesh.geometry.getAttribute("color");
  expect(color.getX(0)).toBeGreaterThan(color.getZ(0));
  overlay.dispose();
});

describe("2D corner markers", () => {
  it.each([false, true])("keeps the ground open and uses the shared highlight colour (%s)", highlighted => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), fill: vi.fn(), closePath: vi.fn(), setLineDash: vi.fn(),
      fillRect: vi.fn(), strokeRect: vi.fn(), arc: vi.fn(), strokeStyle: "", fillStyle: ""
    };
    drawTownSupportPlot2D(ctx as unknown as CanvasRenderingContext2D, 0, 0, 100, highlighted);
    expect(ctx.strokeStyle).toBe(highlighted ? PLOT_AMBER : PLOT_IVORY);
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledTimes(5); // four corners + centre diamond
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.strokeRect).not.toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
});

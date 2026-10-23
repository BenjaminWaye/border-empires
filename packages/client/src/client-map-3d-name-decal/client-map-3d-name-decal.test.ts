import { Scene, type Mesh } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapNameLabelSource } from "../client-map-name-labels/client-map-name-labels.js";
import { createNameDecal } from "./client-map-3d-name-decal.js";

// A stand-in 2D context: the decal only needs enough of it to lay out and "draw" glyphs.
const fakeCanvas = () => {
  const ctx = {
    font: "", globalAlpha: 1, textAlign: "", textBaseline: "", lineJoin: "", lineWidth: 1, strokeStyle: "", fillStyle: "",
    clearRect: () => {}, save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, strokeText: () => {}, fillText: () => {},
    measureText: (text: string) => ({ width: text.length * 60 })
  };
  return { width: 0, height: 0, getContext: () => ctx };
};

const source: MapNameLabelSource = {
  current: () => ({
    signature: "one",
    labels: [{
      kind: "player",
      path: { text: "Waypoint", points: [{ x: 95, y: 50 }, { x: 105, y: 50 }], heightTiles: 2, spanTiles: 12 },
      style: { font: (px) => `${px}px serif`, fill: "#000", stroke: "#fff", alpha: 1, maxSpacingEm: 2, minFontPx: 1, maxFontPx: 200 }
    }]
  })
};

const decalMesh = (scene: Scene): Mesh => scene.children[0] as Mesh;

describe("createNameDecal", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: () => fakeCanvas() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const make = (scene: Scene) =>
    createNameDecal({ scene, source, cornerYAt: () => 0, tileCenterY: () => 0.01, wrapX: (x) => ((x % 640) + 640) % 640, wrapY: (y) => ((y % 320) + 320) % 320, worldWidth: 640, worldHeight: 320 });

  it("disposes the previous ground geometry each time it rebuilds (no leaked GL buffers)", () => {
    const scene = new Scene();
    const decal = make(scene);
    decal.sync({ camX: 100, camY: 50, halfW: 20, halfH: 12, nowMs: 0, terrainRevision: 1 });
    const first = decalMesh(scene).geometry;
    const disposed = vi.fn();
    first.addEventListener("dispose", disposed);
    decal.sync({ camX: 101, camY: 50, halfW: 20, halfH: 12, nowMs: 10, terrainRevision: 1 });
    expect(decalMesh(scene).geometry).not.toBe(first);
    expect(disposed).toHaveBeenCalledTimes(1);
    decal.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("keeps the canvas within its size cap and inside half the world, even for a huge window", () => {
    const scene = new Scene();
    const created: Array<{ width: number; height: number }> = [];
    vi.stubGlobal("document", { createElement: () => { const canvas = fakeCanvas(); created.push(canvas); return canvas; } });
    const decal = make(scene);
    decal.sync({ camX: 100, camY: 50, halfW: 400, halfH: 200, nowMs: 0, terrainRevision: 1 });
    const canvas = created[0]!;
    expect(canvas.width).toBeLessThanOrEqual(2048);
    expect(canvas.height).toBeLessThanOrEqual(2048);
    const uv = decalMesh(scene).geometry.getAttribute("uv");
    for (let index = 0; index < uv.count; index += 1) {
      expect(uv.getX(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(index)).toBeLessThanOrEqual(1);
      expect(uv.getY(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(index)).toBeLessThanOrEqual(1);
    }
    decal.dispose();
  });
});

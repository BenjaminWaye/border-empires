import { describe, expect, it, vi } from "vitest";
import { Group, Mesh } from "three";
import { createIncursionOverlay3D } from "./client-map-3d-incursion-overlay.js";
import type { ShoreFringe } from "../client-map-3d-shore/client-map-3d-shore-sand.js";
import { extendMapShoreOverlays } from "../client-map-3d/client-map-3d-shore-overlays.js";

const fringe: ShoreFringe = {
  positions: [0.2, -0.04, 0, 0.8, -0.04, 0, 0.5, -0.05, 0.3, 1.2, -0.04, 0, 1.8, -0.04, 0, 1.5, -0.05, 0.3],
  seaward: [0, 0, 1, 0, 0, 1],
  polygonVertices: [0, 1, 2, 3, 4, 5],
  polygons: [
    { first: 0, count: 3, landGc: 0, landGr: -1 },
    { first: 3, count: 3, landGc: 1, landGr: -1 }
  ]
};
const noEdges = { north: false, south: false, west: false, east: false };
const colors = { theirs: "#ff0000", mine: "#00ff00" };

describe("incursion stripes on the curved beach", () => {
  it("extends only hatched land to the waterline, preserving stripe phase, colours and material", () => {
    const group = new Group();
    const overlay = createIncursionOverlay3D(group, 2);
    overlay.addTile(0.5, -0.5, 0, colors, "#ffffff", noEdges);
    overlay.commit();
    overlay.extendOntoShore(fringe);
    const tile = group.children[0] as Mesh;
    const shore = group.children[2] as Mesh;
    expect(shore).toBeInstanceOf(Mesh);
    expect(shore.material).toBe(tile.material);
    expect(shore.geometry.index!.count).toBe(3);
    const pos = shore.geometry.getAttribute("position");
    expect(pos.count).toBe(3); // adjacent unhatched land stays bare
    expect(pos.getX(2)).toBeCloseTo(0.5);
    expect(pos.getZ(2)).toBeCloseTo(0.3); // all the way to water, beyond the land tile
    expect(pos.getY(2)).toBeGreaterThan(-0.05 + 0.022); // above ownership tint
    const uv = shore.geometry.getAttribute("hatchUv");
    expect(uv.getX(2)).toBeCloseTo(0.5);
    expect(uv.getY(2)).toBeCloseTo(-0.3); // continuation beyond tile UVs
    expect(shore.geometry.getAttribute("hatchTheirs").getX(2)).toBe(1);
    expect(shore.geometry.getAttribute("hatchMine").getY(2)).toBe(1);
    overlay.dispose();
    expect(group.children).toHaveLength(0);
  });

  it("also extends draped hills and disposes stale beach geometry on clear and rebuild", () => {
    const group = new Group();
    const overlay = createIncursionOverlay3D(group, 2);
    overlay.addTile(0.5, -0.5, 0, colors, "#ffffff", noEdges, undefined, () => 0.2);
    overlay.extendOntoShore(fringe);
    const shore = group.children.at(-1) as Mesh;
    expect(shore.geometry.getAttribute("position").count).toBe(3);
    const dispose = vi.spyOn(shore.geometry, "dispose");
    overlay.extendOntoShore({ ...fringe, polygons: [] });
    expect(dispose).toHaveBeenCalledOnce();
    expect(group.children).not.toContain(shore);
    overlay.extendOntoShore(fringe);
    overlay.clear();
    overlay.extendOntoShore(fringe);
    expect(group.children).toHaveLength(4); // only empty tile and hill buffers
    overlay.dispose();
    expect(group.children).toHaveLength(0);
  });

  it("forwards the beach to hatching alongside ownership and fog", () => {
    const ownership = { extendOntoShore: vi.fn() };
    const fog = { extendOntoShore: vi.fn() };
    const reach = { extendIncursionOntoShore: vi.fn() };
    extendMapShoreOverlays(fringe, ownership, fog, reach);
    expect(reach.extendIncursionOntoShore).toHaveBeenCalledWith(fringe);
    expect(ownership.extendOntoShore).toHaveBeenCalledWith(fringe, 0.15);
    expect(fog.extendOntoShore).toHaveBeenCalledWith(fringe);
  });
});

import { describe, expect, it } from "vitest";
import { BufferGeometry, Group, Mesh } from "three";
import { createIncursionOverlay3D } from "./client-map-3d-incursion-overlay.js";

const drawnQuads = (mesh: Mesh): number => (mesh.geometry as BufferGeometry).drawRange.count / 6;

describe("createIncursionOverlay3D", () => {
  it("draws one hatch quad per tile and an edge strip per open pocket side", () => {
    const group = new Group();
    const overlay = createIncursionOverlay3D(group, 4);
    const [hatch, edges] = group.children as Mesh[];
    overlay.clear();
    overlay.addTile(0, 0, 0, { theirs: "#0b1dda", mine: "#39ff14" }, "#ffffff", { north: true, east: false, south: true, west: true });
    overlay.addTile(1, 0, 0, { theirs: "#0b1dda", mine: "#39ff14" }, "#ffffff", { north: true, east: true, south: true, west: false });
    overlay.commit();
    expect(drawnQuads(hatch!)).toBe(2);
    expect(drawnQuads(edges!)).toBe(6);
    overlay.clear();
    overlay.commit();
    expect(drawnQuads(hatch!)).toBe(0);
    expect(drawnQuads(edges!)).toBe(0);
    overlay.dispose();
    expect(group.children).toHaveLength(0);
  });

  it("stops adding tiles (and their edges) once the hatch buffer is full", () => {
    const group = new Group();
    const overlay = createIncursionOverlay3D(group, 1);
    const [hatch, edges] = group.children as Mesh[];
    const allEdges = { north: true, east: true, south: true, west: true };
    overlay.addTile(0, 0, 0, { theirs: "#0b1dda", mine: "#39ff14" }, "#ffffff", allEdges);
    overlay.addTile(1, 0, 0, { theirs: "#0b1dda", mine: "#39ff14" }, "#ffffff", allEdges);
    overlay.commit();
    expect(drawnQuads(hatch!)).toBe(1);
    expect(drawnQuads(edges!)).toBe(4);
    overlay.dispose();
  });
});

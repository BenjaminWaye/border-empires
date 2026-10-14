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

  it("fan-triangulates breach shapes into their own mesh in the outline colour", () => {
    const group = new Group();
    const overlay = createIncursionOverlay3D(group, 2);
    const breach = group.children[2] as Mesh;
    const shapes = [
      { points: [{ x: 0, y: -0.5 }, { x: 0.2, y: -0.5 }, { x: 0.1, y: -0.9 }] },
      { points: [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: -0.45 }, { x: -0.5, y: -0.45 }] }
    ];
    overlay.addTile(3, 4, 1, { theirs: "#ff0000", mine: "#00ff00" }, "#ffffff", { north: false, east: false, south: false, west: false }, shapes);
    overlay.commit();
    const geometry = breach.geometry as BufferGeometry;
    expect(geometry.drawRange.count).toBe(9); // 1 triangle + a quad's 2
    const position = geometry.getAttribute("position");
    // Tile-local (0.1, -0.9) lands at scene (3.1, y, 3.1): spikes reach into the neighbouring tile.
    expect(position.getX(2)).toBeCloseTo(3.1);
    expect(position.getZ(2)).toBeCloseTo(3.1);
    expect(position.getY(2)).toBeGreaterThan(1);
    const color = geometry.getAttribute("color");
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 1, 1]); // the "#ffffff" outline colour
    overlay.clear();
    overlay.commit();
    expect(geometry.drawRange.count).toBe(0);
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

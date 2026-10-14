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

  it("draws the breach band once per world tile, and a veil quad per breached side", () => {
    const group = new Group();
    const overlay = createIncursionOverlay3D(group, 4);
    const [, , band, veil] = group.children as Mesh[];
    const noEdges = { north: false, east: false, south: false, west: false };
    const hatch = { theirs: "#ff0000", mine: "#00ff00" };
    // Two pocket tiles side by side, both listing the same tile of mine north of the seam.
    const shared = { dx: 0, dy: -1, side: 1 as const, mask: 0b0100_0000 };
    overlay.addTile(0, 0, 0, hatch, "#ffffff", noEdges, { style: "ember", worldX: 10, worldY: 10, layout: { straightEdges: noEdges, band: [shared], veilSides: [] } });
    overlay.addTile(1, 0, 0, hatch, "#ffffff", noEdges, { style: "ember", worldX: 11, worldY: 10, layout: { straightEdges: noEdges, band: [{ ...shared, dx: -1 }], veilSides: [] } });
    overlay.addTile(2, 0, 0, hatch, "#ffffff", noEdges, { style: "veil", worldX: 12, worldY: 10, layout: { straightEdges: noEdges, band: [], veilSides: ["north", "east"] } });
    overlay.commit();
    expect(drawnQuads(band!)).toBe(1);
    expect(drawnQuads(veil!)).toBe(2);
    // The veil stands up off the ground.
    const veilY = (veil!.geometry as BufferGeometry).getAttribute("position");
    expect(Math.max(veilY.getY(0), veilY.getY(2))).toBeGreaterThan(0.3);
    overlay.clear();
    overlay.commit();
    expect(drawnQuads(band!)).toBe(0);
    expect(drawnQuads(veil!)).toBe(0);
    overlay.update(1000);
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

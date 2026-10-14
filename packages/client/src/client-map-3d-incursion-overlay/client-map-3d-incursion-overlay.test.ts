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
    overlay.addTile(0, 0, 0, hatch, "#ffffff", noEdges, { style: "ember", worldX: 10, worldY: 10, layout: { straightEdges: noEdges, front: [], roundedCorners: 0, band: [shared], veilSides: [] } });
    overlay.addTile(1, 0, 0, hatch, "#ffffff", noEdges, { style: "ember", worldX: 11, worldY: 10, layout: { straightEdges: noEdges, front: [], roundedCorners: 0, band: [{ ...shared, dx: -1 }], veilSides: [] } });
    overlay.addTile(2, 0, 0, hatch, "#ffffff", noEdges, { style: "veil", worldX: 12, worldY: 10, layout: { straightEdges: noEdges, front: [], roundedCorners: 0, band: [], veilSides: ["north", "east"] } });
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

  it("draws the spikes front line in the attacker's colour (shaded halves darker) over an offset shadow", () => {
    const group = new Group();
    const overlay = createIncursionOverlay3D(group, 1);
    const [, , , , shadow, front] = group.children as Mesh[];
    const noEdges = { north: false, east: false, south: false, west: false };
    const line = { points: [{ x: -0.5, y: -0.52 }, { x: 0.5, y: -0.52 }, { x: 0.5, y: -0.48 }, { x: -0.5, y: -0.48 }], shade: 1 };
    const half = { points: [{ x: -0.06, y: -0.5 }, { x: 0, y: -0.5 }, { x: 0, y: -0.68 }], shade: 0.5 };
    overlay.addTile(2, 3, 0, { theirs: "#ff0000", mine: "#00ff00" }, "#141414", noEdges, {
      style: "spikes",
      worldX: 2,
      worldY: 3,
      layout: { straightEdges: noEdges, front: [line, half], roundedCorners: 0, band: [], veilSides: [] }
    });
    overlay.commit();
    expect(drawnQuads(front!)).toBe(2);
    expect(drawnQuads(shadow!)).toBe(2);
    const geometry = front!.geometry as BufferGeometry;
    const color = geometry.getAttribute("color");
    expect([color.getX(0), color.getY(0), color.getZ(0)]).toEqual([1, 0, 0]); // the attacker's red
    expect(color.getX(4)).toBeCloseTo(0.5); // shaded tooth half
    const position = geometry.getAttribute("position");
    // The polygon's corners map to quad order p0, p1, p3, p2.
    expect([position.getX(2), position.getZ(2)]).toEqual([1.5, expect.closeTo(2.52)]);
    // The tooth tip reaches into the tile of mine to the north (z = 3 - 0.68).
    expect(position.getZ(6)).toBeCloseTo(2.32);
    const shadowPosition = (shadow!.geometry as BufferGeometry).getAttribute("position");
    expect(shadowPosition.getX(0)).toBeGreaterThan(position.getX(0)); // offset away from the light
    overlay.dispose();
    expect(group.children).toHaveLength(0);
  });

  it("passes the breach's rounded outer corners to the hatch, so the stripes follow the curved front line", () => {
    const group = new Group();
    const overlay = createIncursionOverlay3D(group, 2);
    const hatch = group.children[0] as Mesh;
    const noEdges = { north: false, east: false, south: false, west: false };
    const colours = { theirs: "#ff0000", mine: "#00ff00" };
    overlay.addTile(0, 0, 0, colours, "#141414", noEdges, { style: "spikes", worldX: 0, worldY: 0, layout: { straightEdges: noEdges, front: [], roundedCorners: 0b0101, band: [], veilSides: [] } });
    overlay.addTile(1, 0, 0, colours, "#141414", { north: true, east: true, south: true, west: true });
    overlay.commit();
    const round = (hatch.geometry as BufferGeometry).getAttribute("hatchRound");
    expect(round.getX(0)).toBe(5); // NW + SE
    expect(round.getY(0)).toBeCloseTo(0.28);
    expect(round.getX(4)).toBe(0); // no breach: square
    overlay.dispose();
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

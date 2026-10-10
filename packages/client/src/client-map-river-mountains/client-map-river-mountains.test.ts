import { describe, expect, it } from "vitest";
import { riverEdgeKeyBetween, WORLD_WIDTH, type RiverHead } from "@border-empires/shared";
import { riverCascadeEdges, riverMountainFaceAt, riverMountainFaceOf, riverMountainFaces } from "./client-map-river-mountains.js";

const head = (x: number, y: number, mountain: { x: number; y: number } | null): RiverHead => ({ corner: { x, y }, heading: { dx: 0, dy: 1 }, mountain });

describe("river mountains", () => {
  it("leaves the mountain by its corner one edge from the river head, facing that corner", () => {
    // Head on corner (10, 10); mountain tile (10, 8) has corner (10, 9) one edge north of it.
    const face = riverMountainFaceOf(head(10, 10, { x: 10, y: 8 }))!;
    expect(face.exit).toEqual({ x: 10, y: 9 });
    expect(face.head).toEqual({ x: 10, y: 10 });
    // From the tile centre (10.5, 8.5) to (10, 9).
    expect(face.dirX).toBeCloseTo(-Math.SQRT1_2);
    expect(face.dirY).toBeCloseTo(Math.SQRT1_2);
  });

  it("has no face for a head without a mountain", () => {
    expect(riverMountainFaceOf(head(10, 10, null))).toBeNull();
  });

  it("drops the cascade when the mountain is gone in live terrain (e.g. an AFC footprint)", () => {
    const heads = new Map([[10 * WORLD_WIDTH + 10, head(10, 10, { x: 10, y: 8 })]]);
    expect(riverMountainFaceAt(10, 8, () => true, heads)).not.toBeNull();
    expect(riverMountainFaceAt(10, 8, () => false, heads)).toBeNull();
    expect(riverMountainFaceAt(11, 8, () => true, heads)).toBeNull();
  });

  it("lists each cascade's edge, from the mountain's exit corner to the head", () => {
    const heads = new Map([[10 * WORLD_WIDTH + 10, head(10, 10, { x: 10, y: 8 })]]);
    expect([...riverCascadeEdges(heads)]).toEqual([riverEdgeKeyBetween(10, 9, 10, 10)]);
    expect(riverMountainFaces(heads).size).toBe(1);
  });
});

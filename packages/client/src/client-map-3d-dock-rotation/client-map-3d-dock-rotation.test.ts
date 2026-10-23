import { describe, expect, it } from "vitest";
import { dockRotationAt } from "./client-map-3d-dock-rotation.js";
import type { Tile } from "../client-types.js";

const wrap = (x: number): number => ((x % 10) + 10) % 10;
const seaAt = (sea: ReadonlyArray<readonly [number, number]>) => (x: number, y: number): Tile["terrain"] =>
  sea.some(([sx, sy]) => sx === x && sy === y) ? "SEA" : "LAND";

describe("dockRotationAt", () => {
  it("faces the first sea neighbour, checking south, east, north then west", () => {
    expect(dockRotationAt(5, 5, seaAt([[5, 6], [6, 5]]), wrap, wrap)).toBe(0);
    expect(dockRotationAt(5, 5, seaAt([[6, 5], [5, 4]]), wrap, wrap)).toBe(-Math.PI / 2);
    expect(dockRotationAt(5, 5, seaAt([[5, 4]]), wrap, wrap)).toBe(Math.PI);
    expect(dockRotationAt(5, 5, seaAt([[4, 5]]), wrap, wrap)).toBe(Math.PI / 2);
  });

  it("wraps across the world edge and defaults to 0 with no sea beside it", () => {
    expect(dockRotationAt(9, 0, seaAt([[0, 0]]), wrap, wrap)).toBe(-Math.PI / 2);
    expect(dockRotationAt(5, 5, seaAt([]), wrap, wrap)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { LineBasicMaterial, LineSegments } from "three";
import { createBendingMarkerGeometry } from "../client-map-3d-bending-marker-geometry/client-map-3d-bending-marker-geometry.js";
import { hillRiseAt } from "../client-map-3d-tile-surface-y/client-map-3d-tile-surface-y.js";
import { syncTileHighlightMarker, type TileHighlightDeps } from "./client-tile-highlight-3d.js";

const identity = (n: number): number => n;
const deps = (hillRise?: TileHighlightDeps["hillRiseAt"]): TileHighlightDeps => ({
  sceneOrigin: { camX: 10, camY: 10 },
  wrapX: identity,
  wrapY: identity,
  cornerYAt: () => 0.1,
  toroidDelta: (from, to) => to - from,
  ...(hillRise ? { hillRiseAt: hillRise } : {})
});
const markerYs = (d: TileHighlightDeps): number[] => {
  const marker = new LineSegments(createBendingMarkerGeometry(), new LineBasicMaterial());
  syncTileHighlightMarker(d, marker, { x: 10, y: 10 }, 0.01);
  const p = marker.geometry.getAttribute("position").array as Float32Array;
  return [p[1]!, p[4]!, p[10]!, p[16]!];
};

describe("tile highlight outline on hills", () => {
  it("sits on flat ground at the corner heights", () => {
    for (const y of markerYs(deps())) expect(y).toBeCloseTo(0.11, 6);
  });

  it("rises with a hill mass so it lies on the dome, not under it", () => {
    // Joined hill tiles stay raised up to their shared edges, where the
    // outline's corners sit; drawn at flat ground it hid under the hill.
    const field = (): boolean => true;
    const rise = (x: number, y: number, u: number, v: number): number =>
      hillRiseAt({ isHillsAt: field, wrapX: identity, wrapY: identity, roadDirsAt: () => undefined }, x, y, u, v);
    expect(rise(10, 10, 0.48, 0.48)).toBeGreaterThan(0.05);
    for (const y of markerYs(deps(rise))) expect(y).toBeGreaterThan(0.11 + 0.05);
  });

  it("leaves a lone hill's corners on the ground", () => {
    const lone = (x: number, y: number): boolean => x === 10 && y === 10;
    expect(hillRiseAt({ isHillsAt: lone, wrapX: identity, wrapY: identity, roadDirsAt: () => undefined }, 10, 10, 0.48, 0.48)).toBe(0);
  });
});

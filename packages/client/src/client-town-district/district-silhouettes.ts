import type { DistrictVisualKind } from "./district-catalog.js";
import { createDistrictGeometry } from "./district-geometry.js";

const SIZE = 40;
type Point = readonly [number, number];
const cross = (a: Point, b: Point, p: Point): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

// Compare actual solid outlines, without colour, lamps, smoke or the shared
// slab. Fixed world scale preserves size differences; three azimuths catch
// models that only differ by an ornament hidden behind the front facade.
export const silhouettes = (kind: DistrictVisualKind, worldSpan = 0.7): Uint8Array[] => {
  const model = createDistrictGeometry(kind, false);
  const masks = [-Math.PI / 4, Math.PI / 4, Math.PI].map(() => new Uint8Array(SIZE * SIZE));
  for (const [view, yaw] of [-Math.PI / 4, Math.PI / 4, Math.PI].entries()) {
    const mask = masks[view]!;
    for (const layer of ["body", "metal", "glass"] as const) {
      const geometry = model.layers[layer];
      if (!geometry) continue;
      const position = geometry.getAttribute("position");
      const index = geometry.index;
      for (let n = 0; n < (index?.count ?? position.count); n += 3) {
        const points: Point[] = [];
        let aboveGround = false;
        for (let v = 0; v < 3; v += 1) {
          const i = index ? index.getX(n + v) : n + v;
          const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
          if (y > 0.065) aboveGround = true;
          const rx = x * Math.cos(yaw) - z * Math.sin(yaw);
          const rz = x * Math.sin(yaw) + z * Math.cos(yaw);
          points.push([SIZE / 2 + rx * SIZE / worldSpan, SIZE * 0.76 + (rz * 0.5 - y) * SIZE / worldSpan]);
        }
        if (!aboveGround) continue;
        const [a, b, c] = points as [Point, Point, Point];
        const area = cross(a, b, c);
        if (Math.abs(area) < 0.01) continue;
        const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
        const maxX = Math.min(SIZE - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
        const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
        const maxY = Math.min(SIZE - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
        for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
          const p: Point = [x + 0.5, y + 0.5];
          if (cross(a, b, p) * area >= 0 && cross(b, c, p) * area >= 0 && cross(c, a, p) * area >= 0) mask[y * SIZE + x] = 1;
        }
      }
    }
  }
  for (const geometry of Object.values(model.layers)) geometry.dispose();
  return masks;
};

export const similarity = (a: readonly Uint8Array[], b: readonly Uint8Array[]): number => {
  let intersection = 0, union = 0;
  for (let view = 0; view < a.length; view += 1) for (let i = 0; i < SIZE * SIZE; i += 1) {
    if (a[view]![i] && b[view]![i]) intersection += 1;
    if (a[view]![i] || b[view]![i]) union += 1;
  }
  return intersection / union;
};

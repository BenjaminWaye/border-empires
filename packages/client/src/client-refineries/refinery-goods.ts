// Moving goods on a working refinery's supply line (docs/territory-
// development-plan.md, Phase 2, Client): small loads leave the field and
// travel the line to the refinery, evenly spaced, at a steady walk. Pure, so
// the 2D canvas and the true-3D instanced loads place them identically.
import type { RefineryFieldResource } from "@border-empires/shared";
import type { DistrictPoint } from "../client-town-district/district-network.js";
import type { RefinerySupplyPath } from "./refinery-scene.js";

/** Tiles per second a load travels. */
export const REFINERY_GOODS_SPEED = 0.45;
/** Roughly one load per this many tiles of line, and at least two per line. */
const LOAD_SPACING_TILES = 1.4;
export const MAX_LOADS_PER_LINE = 8;

export const REFINERY_GOODS_COLORS: Readonly<Record<RefineryFieldResource, string>> = {
  TITANIUM: "#c8d0d8",
  UMBRITE: "#9b6ad6",
  GEMS: "#72d8ff"
};

const segmentLengths = (points: readonly DistrictPoint[]): number[] =>
  points.slice(1).map((point, i) => Math.hypot(point.x - points[i]!.x, point.y - points[i]!.y));

/** Where the line's loads are at `nowMs` (field end first), in the path's unwrapped world coordinates; none when not working. */
export const refineryGoodsPositions = (path: Pick<RefinerySupplyPath, "points" | "working">, nowMs: number): DistrictPoint[] => {
  if (!path.working || path.points.length < 2) return [];
  // Goods flow from the field (the last point) to the refinery (the first).
  const points = [...path.points].reverse();
  const lengths = segmentLengths(points);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total <= 0) return [];
  const loads = Math.min(MAX_LOADS_PER_LINE, Math.max(2, Math.round(total / LOAD_SPACING_TILES)));
  const phase = ((nowMs / 1000) * REFINERY_GOODS_SPEED / total) % 1;
  const positions: DistrictPoint[] = [];
  for (let load = 0; load < loads; load += 1) {
    let distance = ((phase + load / loads) % 1) * total;
    for (let i = 0; i < lengths.length; i += 1) {
      const length = lengths[i]!;
      if (distance <= length || i === lengths.length - 1) {
        const a = points[i]!, b = points[i + 1]!, t = length > 0 ? Math.min(1, distance / length) : 0;
        positions.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        break;
      }
      distance -= length;
    }
  }
  return positions;
};

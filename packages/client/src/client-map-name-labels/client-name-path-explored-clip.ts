// Keeps a map name on ground the player has explored: the label path is
// walked in half-tile steps and cut down to its longest stretch over explored
// tiles, so the name compacts into what has been seen instead of running out
// under the unexplored storm (and so it gives nothing away about land beyond
// the explored edge). Returns undefined when too little of it is explored to
// carry a name at all.
import type { NameLabelPath } from "./client-map-name-label-draw.js";

const STEP_TILES = 0.5;
/** Explored stretch below which a name isn't shown. */
export const MIN_EXPLORED_LABEL_TILES = 2;

export const clipNamePathToExplored = (
  path: NameLabelPath,
  isExploredAt: (x: number, y: number) => boolean
): NameLabelPath | undefined => {
  const samples: Array<{ x: number; y: number; explored: boolean }> = [];
  for (let index = 1; index < path.points.length; index += 1) {
    const a = path.points[index - 1]!;
    const b = path.points[index]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / STEP_TILES));
    for (let step = index === 1 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      samples.push({ x, y, explored: isExploredAt(Math.round(x), Math.round(y)) });
    }
  }
  if (samples.every((sample) => sample.explored)) return path;
  let bestStart = -1;
  let bestEnd = -1;
  let runStart = -1;
  samples.forEach((sample, index) => {
    if (!sample.explored) {
      runStart = -1;
      return;
    }
    if (runStart < 0) runStart = index;
    if (index - runStart > bestEnd - bestStart) {
      bestStart = runStart;
      bestEnd = index;
    }
  });
  if (bestStart < 0) return undefined;
  const points = samples.slice(bestStart, bestEnd + 1).map(({ x, y }) => ({ x, y }));
  let lengthTiles = 0;
  for (let index = 1; index < points.length; index += 1) lengthTiles += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  if (lengthTiles < MIN_EXPLORED_LABEL_TILES || points.length < 2) return undefined;
  // No rim beyond the cut ends: the stretch between the first and last good samples is all the room the name gets.
  return { ...path, points, spanTiles: lengthTiles };
};

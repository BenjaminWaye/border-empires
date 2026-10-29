import type { LineSegments } from "three";

/** Hide the active queue/target marker pool before rebuilding its placements. */
export const hideLineMarkerPool = (pool: Array<{ marker: LineSegments }>): void => {
  for (const { marker } of pool) marker.visible = false;
};

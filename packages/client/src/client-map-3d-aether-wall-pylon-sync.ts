import { buildAetherWallSegments, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { ActiveAetherWallView } from "./client-types.js";
import type { AetherWallPylonOverlay } from "./client-map-3d-aether-wall-pylon-overlay.js";

// Wires `AetherWallPylonOverlay` up to live game state: for every active
// wall, walks its tile-edge segments (buildAetherWallSegments) and places a
// pooled pylon at each edge's two corner points, matching where the 2D
// canvas path (drawAetherWallSegment) paints its flat pylon glyphs.
const MARKER_RISE_ABOVE_HEIGHTFIELD = 0.01;

const edgeCorners = (
  baseX: number,
  baseY: number,
  direction: ActiveAetherWallView["direction"],
  wrapX: (x: number) => number,
  wrapY: (y: number) => number
): [{ x: number; y: number }, { x: number; y: number }] => {
  const x0 = baseX;
  const y0 = baseY;
  const x1 = wrapX(baseX + 1);
  const y1 = wrapY(baseY + 1);
  if (direction === "N") return [{ x: x0, y: y0 }, { x: x1, y: y0 }];
  if (direction === "E") return [{ x: x1, y: y0 }, { x: x1, y: y1 }];
  if (direction === "S") return [{ x: x0, y: y1 }, { x: x1, y: y1 }];
  return [{ x: x0, y: y0 }, { x: x0, y: y1 }];
};

export const createAetherWallPylonSync = (
  overlay: AetherWallPylonOverlay,
  cornerYAt: (cornerX: number, cornerZ: number) => number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number,
  sceneOrigin: { camX: number; camY: number }
) => (activeAetherWalls: ActiveAetherWallView[], nowMs: number): void => {
  overlay.beginFrame();
  const now = Date.now();
  for (const wall of activeAetherWalls) {
    if (wall.endsAt <= now) continue;
    const segments = buildAetherWallSegments(wall.origin.x, wall.origin.y, wall.direction, wall.length, wrapX, wrapY);
    for (const segment of segments) {
      const [from, to] = edgeCorners(segment.baseX, segment.baseY, wall.direction, wrapX, wrapY);
      const faceAngle = Math.atan2(
        toroidDelta(from.x, to.x, WORLD_WIDTH),
        toroidDelta(from.y, to.y, WORLD_HEIGHT)
      );
      for (const corner of [from, to]) {
        const sceneX = toroidDelta(sceneOrigin.camX, corner.x, WORLD_WIDTH);
        const sceneZ = toroidDelta(sceneOrigin.camY, corner.y, WORLD_HEIGHT);
        overlay.place(sceneX, cornerYAt(corner.x, corner.y) + MARKER_RISE_ABOVE_HEIGHTFIELD, sceneZ, faceAngle, nowMs);
      }
    }
  }
  overlay.endFrame();
};

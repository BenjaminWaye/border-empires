import { buildAetherWallSegments, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "./client-map-3d-pointer-pick.js";
import type { ActiveAetherWallView } from "./client-types.js";
import type { AetherWallPylonOverlay } from "./client-map-3d-aether-wall-pylon-overlay.js";
import type { AetherWallArcOverlay } from "./client-map-3d-aether-wall-arc-overlay.js";

// Wires `AetherWallPylonOverlay` and `AetherWallArcOverlay` up to live game
// state: for every active wall, walks its tile-edge segments
// (buildAetherWallSegments), places a pooled pylon at each edge's two corner
// points (matching where the 2D canvas path's drawAetherWallSegment paints
// its flat pylon glyphs), and strings a pooled pulsing-electricity arc
// between that same pair of corners.
const WALL_PYLON_RISE_ABOVE_HEIGHTFIELD = 0.01;
const ARC_RISE_ABOVE_HEIGHTFIELD = 0.09;

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
  arcOverlay: AetherWallArcOverlay,
  cornerYAt: (cornerX: number, cornerZ: number) => number,
  wrapX: (x: number) => number,
  wrapY: (y: number) => number,
  sceneOrigin: { camX: number; camY: number }
) => (activeAetherWalls: ActiveAetherWallView[], nowMs: number): void => {
  overlay.beginFrame();
  arcOverlay.beginFrame();
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
      const scenePoints = [from, to].map((corner) => ({
        x: toroidDelta(sceneOrigin.camX, corner.x, WORLD_WIDTH),
        y: cornerYAt(corner.x, corner.y),
        z: toroidDelta(sceneOrigin.camY, corner.y, WORLD_HEIGHT)
      }));
      for (const point of scenePoints) overlay.place(point.x, point.y + WALL_PYLON_RISE_ABOVE_HEIGHTFIELD, point.z, faceAngle, nowMs);
      const [fromScene, toScene] = scenePoints as [typeof scenePoints[0], typeof scenePoints[0]];
      arcOverlay.place(
        fromScene.x, fromScene.y + ARC_RISE_ABOVE_HEIGHTFIELD, fromScene.z,
        toScene.x, toScene.y + ARC_RISE_ABOVE_HEIGHTFIELD, toScene.z,
        nowMs
      );
    }
  }
  overlay.endFrame();
  arcOverlay.endFrame();
};

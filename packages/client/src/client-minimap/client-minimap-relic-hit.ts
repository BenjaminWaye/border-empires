import { WORLD_HEIGHT, WORLD_WIDTH, type RelicMapHint } from "@border-empires/shared";
import { unwrapIntoBox } from "./client-minimap-view-box.js";
import { miniMapBoxPoint, type MiniMapBox } from "./client-minimap-tile-layer.js";

// A relic's minimap box (a rival's aether wake, or the transponder of one
// in signal range) is drawn even when the site lies outside the minimap's
// view, pinned to the edge with an arrow (drawMiniMap). Pressing the minimap
// normally centres the camera on the pressed point, which for an edge-pinned
// box is the minimap's edge, not the relic. This finds the box under the
// press so the camera can go to the relic itself.

const HIT_RADIUS_PX = 10;

export type MiniMapEdgeArrow = { x: number; y: number; angle: number };

// Clamps a pixel point that falls outside the [0,w]x[0,h] minimap canvas onto
// its border, along the ray from the canvas center through that point,
// inset by `margin` px — used to draw a direction indicator for things (like
// a distant relic hint) that fell outside the minimap's current view
// box rather than just omitting them.
export const miniMapEdgeArrowPoint = (targetX: number, targetY: number, w: number, h: number, margin = 8): MiniMapEdgeArrow => {
  const cx = w / 2;
  const cy = h / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy, angle: 0 };
  const halfW = Math.max(1, w / 2 - margin);
  const halfH = Math.max(1, h / 2 - margin);
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale, angle: Math.atan2(dy, dx) };
};

const nearBoxCenter = (coord: number, boxMin: number, boxSize: number, worldSize: number): number =>
  unwrapIntoBox(coord, boxMin + boxSize / 2 - worldSize / 2, worldSize);

/** Where drawMiniMap puts a relic box, in the same pixel space as `w` x `h`. */
export const miniMapRelicMarkerPoint = (hint: { x: number; y: number }, box: MiniMapBox, w: number, h: number, edgeMargin = 8): { x: number; y: number } => {
  const x = nearBoxCenter(hint.x, box.x0, box.w, WORLD_WIDTH);
  const y = nearBoxCenter(hint.y, box.y0, box.h, WORLD_HEIGHT);
  const px = ((x - box.x0) / box.w) * w;
  const py = ((y - box.y0) / box.h) * h;
  // Same in-view test as drawMiniMap's inBox, so the hit lands where the box is drawn.
  if (miniMapBoxPoint(x, y, box)) return { x: ((x + 0.5 - box.x0) / box.w) * w, y: ((y + 0.5 - box.y0) / box.h) * h };
  const edge = miniMapEdgeArrowPoint(px, py, w, h, edgeMargin);
  return { x: edge.x, y: edge.y };
};

/** The relic (wake or transponder) whose minimap box is under (px, py), nearest first; survey signatures are ignored. */
export const miniMapRelicHintAt = (
  hints: Iterable<RelicMapHint>,
  box: MiniMapBox,
  w: number,
  h: number,
  px: number,
  py: number,
  edgeMargin = 8
): RelicMapHint | undefined => {
  let best: RelicMapHint | undefined;
  let bestDist = HIT_RADIUS_PX * HIT_RADIUS_PX;
  for (const hint of hints) {
    if (hint.kind !== "WAKE" && hint.kind !== "RELIC") continue;
    const point = miniMapRelicMarkerPoint(hint, box, w, h, edgeMargin);
    const dist = (point.x - px) ** 2 + (point.y - py) ** 2;
    if (dist <= bestDist) {
      best = hint;
      bestDist = dist;
    }
  }
  return best;
};

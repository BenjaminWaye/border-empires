import { tileKeysAroundAnchor } from "../client-reach-overlay/client-reach-overlay-anchor-disk.js";
import type { ReachBoundaryDeps } from "../client-reach-overlay/client-reach-overlay.js";

// Split out of client-reach-overlay.ts (500-line file cap, AGENTS.md): this
// beacon-siting ghost preview is a fully separate concern from the
// authoritative reach-boundary rendering the rest of that module handles.

/**
 * Ghost preview of the reach disk a not-yet-built outpost-family structure
 * (RELAY_BEACON etc.) would add, so beacon siting is an informed spatial
 * choice. `centerX`/`centerY` are the candidate placement tile's world
 * coords; call once per candidate tile while the structure-placement UI has
 * a pending selection (see client-action-flow.ts's structure placement
 * flow for where a pending build target is tracked).
 */
export const computeOutpostReachPreview = (centerX: number, centerY: number): Set<string> => {
  const reach = new Set<string>();
  for (const key of tileKeysAroundAnchor({ x: centerX, y: centerY, kind: "OUTPOST" })) reach.add(key);
  return reach;
};

const PREVIEW_BOUNDARY_COLOR = "rgba(150, 220, 255, 0.9)";

export const drawOutpostReachPreviewTile = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  px: number,
  py: number,
  size: number,
  preview: ReadonlySet<string>,
  deps: ReachBoundaryDeps
): void => {
  if (!preview.has(deps.keyFor(x, y))) return;
  ctx.save();
  ctx.fillStyle = "rgba(150, 220, 255, 0.10)";
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  const top = !preview.has(deps.keyFor(deps.wrapX(x), deps.wrapY(y - 1)));
  const right = !preview.has(deps.keyFor(deps.wrapX(x + 1), deps.wrapY(y)));
  const bottom = !preview.has(deps.keyFor(deps.wrapX(x), deps.wrapY(y + 1)));
  const left = !preview.has(deps.keyFor(deps.wrapX(x - 1), deps.wrapY(y)));
  if (top || right || bottom || left) {
    ctx.strokeStyle = PREVIEW_BOUNDARY_COLOR;
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.setLineDash([3, 2]);
    const x1 = px + 1.5;
    const y1 = py + 1.5;
    const x2 = px + size - 1.5;
    const y2 = py + size - 1.5;
    ctx.beginPath();
    if (top) {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y1);
    }
    if (right) {
      ctx.moveTo(x2, y1);
      ctx.lineTo(x2, y2);
    }
    if (bottom) {
      ctx.moveTo(x2, y2);
      ctx.lineTo(x1, y2);
    }
    if (left) {
      ctx.moveTo(x1, y2);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  }
  ctx.restore();
};

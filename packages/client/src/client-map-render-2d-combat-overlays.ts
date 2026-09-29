// Workstream F4 (docs/replenishment-update-plan.md): 2D canvas renderer
// counterparts to the 3D-only F0 (win-chance paint), F1 (arrow gesture
// visual) and F3 (shield-area coverage) overlays. Deliberately reuses the
// same renderer-agnostic pure data as the 3D overlays --
// state.winChancePaint / state.arrowGesture (client-state.ts) and
// tileShieldCoverage (client-known-shield-flags.ts) -- only the drawing
// itself (canvas 2D fillRect/line/arrowhead instead of a Three.js mesh) is
// new here.
//
// Kept out of client-runtime-loop.ts (already far over the repo's 500-line
// file cap per AGENTS.md, so it may not grow) -- that file only gets single
// call-outs appended onto existing lines, same pattern client-win-chance-
// paint-trigger.ts and the other 2D-only draw helpers already use.

import type { ClientState } from "./client-state/client-state.js";

export type WinChancePaintState = ClientState["winChancePaint"];
export type ArrowGestureState2D = ClientState["arrowGesture"];
export type WinChanceLabelEntry2D = { winChance: number; color: string };

/** Pure: looks up the F0 win-chance label (percentage + color) for one world tile, if any is currently armed and covers it. */
export const winChancePaintColorForTile2D = (
  winChancePaint: WinChancePaintState,
  wx: number,
  wy: number
): WinChanceLabelEntry2D | undefined => {
  const entry = winChancePaint?.entries.find((e) => e.x === wx && e.y === wy);
  return entry ? { winChance: entry.winChance, color: entry.color } : undefined;
};

/**
 * F0 2D equivalent of client-map-3d-win-chance-paint-overlay.ts's text
 * sprite: a "XX%" label with a dark shadow, centered over the tile --
 * redesigned from an earlier tinted-rect version per design feedback (the
 * squares read poorly against terrain; a shadowed percentage is clearer and
 * still color-codes red/amber/green via winChanceColor).
 */
export const drawWinChanceLabel2D = (ctx: CanvasRenderingContext2D, entry: WinChanceLabelEntry2D, px: number, py: number, size: number): void => {
  const text = `${Math.round(entry.winChance * 100)}%`;
  const cx = px + size / 2;
  const cy = py + size / 2;
  ctx.save();
  ctx.font = `900 ${Math.max(10, Math.round(size * 0.34))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = entry.color;
  ctx.fillText(text, cx, cy);
  ctx.restore();
};

/** F3 2D equivalent of client-map-3d-shield-area-overlay.ts's tinted plane: a fainter tinted rect, owner-colored, drawn under the win-chance paint. */
export const drawShieldAreaTile2D = (ctx: CanvasRenderingContext2D, ownerColor: string, px: number, py: number, size: number): void => {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = ownerColor;
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  ctx.restore();
};

const ARROW_COLOR_2D = "#ffd54a";

/**
 * F1/F2 2D equivalent of client-map-3d-arrow-overlay.ts's shaft+cone: a
 * straight canvas line from the drag's origin tile center to its target
 * tile center, plus a filled triangular arrowhead at the target end.
 * `tileCenterOnScreen` is expected to be the shared worldToScreen
 * (client-map-math.ts), which is already renderer-agnostic toroid math --
 * not a 3D-specific projection.
 */
export const drawArrowGesture2D = (
  ctx: CanvasRenderingContext2D,
  arrowGesture: ArrowGestureState2D,
  tileCenterOnScreen: (wx: number, wy: number) => { sx: number; sy: number },
  size: number
): void => {
  if (!arrowGesture) return;
  const from = tileCenterOnScreen(arrowGesture.origin.x, arrowGesture.origin.y);
  const to = tileCenterOnScreen(arrowGesture.target.x, arrowGesture.target.y);
  const dx = to.sx - from.sx;
  const dy = to.sy - from.sy;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const angle = Math.atan2(dy, dx);
  const headLength = Math.max(6, size * 0.32);
  ctx.save();
  ctx.strokeStyle = ARROW_COLOR_2D;
  ctx.fillStyle = ARROW_COLOR_2D;
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from.sx, from.sy);
  ctx.lineTo(to.sx, to.sy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.sx, to.sy);
  ctx.lineTo(to.sx - headLength * Math.cos(angle - Math.PI / 6), to.sy - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.sx - headLength * Math.cos(angle + Math.PI / 6), to.sy - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

import type { Tile } from "../client-types.js";
import { createStalledConstructionRefresher } from "../client-construction-stall-refresh/client-construction-stall-refresh.js";

// Extracted out of client-runtime-loop.ts (500-line file cap, AGENTS.md):
// the 2D map's on-tile build/removal countdown label, plus the stalled-build
// reconcile it piggybacks on (see client-construction-stall-refresh.ts), is
// one self-contained per-tile overlay.

export type ConstructionCountdownOverlay2DDeps = {
  ctx: CanvasRenderingContext2D;
  constructionRemainingMsForTile: (tile: Tile) => number | undefined;
  formatCountdownClock: (ms: number) => string;
  requestTileDetailIfNeeded: (tile: Tile | undefined, options?: { force?: boolean }) => void;
};

export const createConstructionCountdownOverlay2D = (
  deps: ConstructionCountdownOverlay2DDeps
): ((t: Tile, wk: string, px: number, py: number, size: number) => void) => {
  const maybeRefreshStalledConstruction = createStalledConstructionRefresher({
    requestTileDetailIfNeeded: deps.requestTileDetailIfNeeded
  });
  return (t, wk, px, py, size) => {
    const remainingConstructionMs = deps.constructionRemainingMsForTile(t);
    if (remainingConstructionMs === undefined) return;
    maybeRefreshStalledConstruction(t, wk, remainingConstructionMs);
    if (size < 18) return;
    const timerLabel = deps.formatCountdownClock(remainingConstructionMs);
    deps.ctx.fillStyle = "rgba(6, 10, 18, 0.82)";
    deps.ctx.fillRect(px + 2, py + size - 12, Math.min(size - 4, 30), 10);
    deps.ctx.fillStyle = "rgba(236, 243, 255, 0.92)";
    deps.ctx.font = "9px monospace";
    deps.ctx.textBaseline = "top";
    deps.ctx.fillText(timerLabel, px + 4, py + size - 11);
  };
};

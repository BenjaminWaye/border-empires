import type { ManpowerPanelMusterFlag } from "../client-side-panel-html/client-side-panel-html.js";
import type { Tile } from "../client-types.js";

/**
 * Builds the "Active muster flags" list for the manpower detail panel, mirroring
 * the ownership filter used by client-persistent-alerts.ts (tile.muster.ownerId,
 * not tile.ownerId, since muster ownership lives on the muster object itself).
 */
export const buildManpowerPanelMusterFlags = (tiles: Iterable<Tile>, me: string): ManpowerPanelMusterFlag[] => {
  const flags: ManpowerPanelMusterFlag[] = [];
  for (const tile of tiles) {
    if (!tile.muster || tile.muster.ownerId !== me) continue;
    flags.push({
      x: tile.x,
      y: tile.y,
      amount: tile.muster.amount,
      mode: tile.muster.mode,
      ...(tile.muster.targetX !== undefined ? { targetX: tile.muster.targetX } : {}),
      ...(tile.muster.targetY !== undefined ? { targetY: tile.muster.targetY } : {})
    });
  }
  return flags;
};

export const wireMusterFocusButtons = (
  root: ParentNode,
  state: { camX: number; camY: number; selected?: { x: number; y: number } | undefined },
  deps: { wrapX: (x: number) => number; wrapY: (y: number) => number; requestViewRefresh: () => void; rerender: () => void }
): void => {
  const buttons = root.querySelectorAll("[data-muster-focus-x][data-muster-focus-y]") as NodeListOf<HTMLButtonElement>;
  buttons.forEach((btn) => {
    btn.onclick = () => {
      const x = Number(btn.dataset.musterFocusX);
      const y = Number(btn.dataset.musterFocusY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      state.camX = deps.wrapX(x);
      state.camY = deps.wrapY(y);
      state.selected = { x: state.camX, y: state.camY };
      deps.requestViewRefresh();
      deps.rerender();
    };
  });
};

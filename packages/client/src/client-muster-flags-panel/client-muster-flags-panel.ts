import { musterFlagCap } from "@border-empires/shared";
import type { ManpowerPanelMusterFlag } from "../client-side-panel-html/client-side-panel-html.js";
import type { Tile } from "../client-types.js";
import { predictedMusterAmount, type MusterRateCache } from "../client-muster-prediction/client-muster-prediction.js";

/**
 * Builds the "Active muster flags" list for the manpower detail panel, mirroring
 * the ownership filter used by client-persistent-alerts.ts (tile.muster.ownerId,
 * not tile.ownerId, since muster ownership lives on the muster object itself).
 *
 * `amount` is the interpolated (predicted) staged amount, not the raw
 * server value — see client-muster-prediction.ts — so this list animates
 * between sparse server ticks the same way the tile menu does.
 */
export const buildManpowerPanelMusterFlags = (
  tiles: Iterable<Tile>,
  me: string,
  manpowerCap: number,
  manpower: number,
  musterAmountRateByTile: MusterRateCache
): ManpowerPanelMusterFlag[] => {
  const flags: ManpowerPanelMusterFlag[] = [];
  for (const tile of tiles) {
    if (!tile.muster || tile.muster.ownerId !== me) continue;
    const cap = musterFlagCap(manpowerCap, tile.muster.capLevel);
    const amount = predictedMusterAmount(musterAmountRateByTile, `${tile.x},${tile.y}`, tile, me, cap, manpower);
    flags.push({
      x: tile.x,
      y: tile.y,
      amount,
      mode: tile.muster.mode,
      ...(tile.muster.targetX !== undefined ? { targetX: tile.muster.targetX } : {}),
      ...(tile.muster.targetY !== undefined ? { targetY: tile.muster.targetY } : {}),
      ...(tile.muster.inFlight !== undefined ? { inFlight: tile.muster.inFlight } : {}),
      ...(tile.muster.nextActionAt !== undefined ? { nextActionAt: tile.muster.nextActionAt } : {}),
      ...(tile.muster.fightX !== undefined ? { fightX: tile.muster.fightX } : {}),
      ...(tile.muster.fightY !== undefined ? { fightY: tile.muster.fightY } : {}),
      ...(tile.muster.noTargetInRange !== undefined ? { noTargetInRange: tile.muster.noTargetInRange } : {}),
      ...(tile.muster.insufficientManpower !== undefined ? { insufficientManpower: tile.muster.insufficientManpower } : {})
    });
  }
  return flags;
};

export const wireMusterFocusButtons = (
  root: ParentNode,
  state: { camX: number; camY: number; camSubX: number; camSubY: number; selected?: { x: number; y: number } | undefined },
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
      state.camSubX = 0;
      state.camSubY = 0;
      state.selected = { x: state.camX, y: state.camY };
      deps.requestViewRefresh();
      deps.rerender();
    };
  });
};

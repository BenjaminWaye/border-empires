import { musterFlagCap } from "@border-empires/shared";
import { musterFightIsClaim, type ManpowerPanelMusterFlag } from "../client-side-panel-html/client-side-panel-html.js";
import type { Tile } from "../client-types.js";
import { predictedMusterAmount, type MusterRateCache } from "../client-muster-prediction/client-muster-prediction.js";
import { setManpowerInfoOpen } from "../client-manpower-panel-info/client-manpower-panel-info.js";
import { forgetMusterDrawsExcept, musterDrawLog, musterDrawnRecently, observeMusterSample, type MusterDrawLog } from "../client-muster-draw-log/client-muster-draw-log.js";

/**
 * Builds the "Active muster flags" list for the manpower detail panel, mirroring
 * the ownership filter used by client-persistent-alerts.ts (tile.muster.ownerId,
 * not tile.ownerId, since muster ownership lives on the muster object itself).
 *
 * `amount` is the interpolated (predicted) staged amount, not the raw
 * server value — see client-muster-prediction.ts — so this list animates
 * between sparse server ticks the same way the tile menu does.
 *
 * Each call also feeds the draw log (client-muster-draw-log.ts), so every flag
 * carries what it drew lately and whether it is refilling from the pool now.
 */
export const buildManpowerPanelMusterFlags = (
  tiles: Iterable<Tile>,
  me: string,
  manpowerCap: number,
  manpower: number,
  musterAmountRateByTile: MusterRateCache,
  tileAt: (x: number, y: number) => Tile | undefined = () => undefined,
  drawLog: MusterDrawLog = musterDrawLog,
  nowMs: number = Date.now()
): ManpowerPanelMusterFlag[] => {
  const flags: ManpowerPanelMusterFlag[] = [];
  const seen = new Set<string>();
  for (const tile of tiles) {
    if (!tile.muster || tile.muster.ownerId !== me) continue;
    const key = `${tile.x},${tile.y}`;
    const cap = musterFlagCap(manpowerCap, tile.muster.capLevel);
    const amount = predictedMusterAmount(musterAmountRateByTile, key, tile, me, cap, manpower, nowMs);
    seen.add(key);
    observeMusterSample(drawLog, key, tile.muster, nowMs);
    const ratePerMin = tile.muster.ratePerMin ?? 0;
    flags.push({
      x: tile.x,
      y: tile.y,
      amount,
      cap,
      drawnRecently: musterDrawnRecently(drawLog, key, nowMs),
      // Inflow stops at the flag's cap and when the pool is empty (runtime-muster-tick.ts).
      refillPerMin: ratePerMin > 0 && amount < cap - 0.5 && manpower > 0 ? ratePerMin : 0,
      mode: tile.muster.mode,
      ...(tile.muster.targetX !== undefined ? { targetX: tile.muster.targetX } : {}),
      ...(tile.muster.targetY !== undefined ? { targetY: tile.muster.targetY } : {}),
      ...(tile.muster.inFlight !== undefined ? { inFlight: tile.muster.inFlight } : {}),
      ...(tile.muster.inFlightCount !== undefined ? { inFlightCount: tile.muster.inFlightCount } : {}),
      ...(tile.muster.nextActionAt !== undefined ? { nextActionAt: tile.muster.nextActionAt } : {}),
      ...(tile.muster.fightX !== undefined ? { fightX: tile.muster.fightX } : {}),
      ...(tile.muster.fightY !== undefined ? { fightY: tile.muster.fightY } : {}),
      ...(musterFightIsClaim(tile.muster, me, tileAt) ? { fightClaim: true } : {}),
      ...(tile.muster.noTargetInRange !== undefined ? { noTargetInRange: tile.muster.noTargetInRange } : {}),
      ...(tile.muster.insufficientManpower !== undefined ? { insufficientManpower: tile.muster.insufficientManpower } : {}),
      ...(tile.muster.unfundableTarget !== undefined ? { unfundableTarget: tile.muster.unfundableTarget } : {}),
      ...(tile.muster.clearing !== undefined ? { clearing: tile.muster.clearing } : {})
    });
  }
  forgetMusterDrawsExcept(drawLog, seen);
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

/** Wires every interactive bit of the manpower panel: muster flag focus rows and the "how manpower works" toggle. */
export const wireManpowerPanel = (
  root: ParentNode,
  state: Parameters<typeof wireMusterFocusButtons>[1],
  deps: Parameters<typeof wireMusterFocusButtons>[2]
): void => {
  wireMusterFocusButtons(root, state, deps);
  root.querySelectorAll<HTMLDetailsElement>("details[data-manpower-info]").forEach((details) => {
    details.ontoggle = () => setManpowerInfoOpen(details.open);
  });
};

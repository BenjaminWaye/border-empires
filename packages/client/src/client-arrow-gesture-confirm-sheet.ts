import { supplyTradeAttackWarningText, type SupplyWarningState } from "./client-supply-trade-attack-warning/client-supply-trade-attack-warning.js";
import { attackFloorForPlayer } from "./client-attack-commit/client-attack-floor.js";
import { MUSTER_ATTACK_COST } from "@border-empires/shared";
import { buildArrowGestureSetMusterPayload } from "./client-arrow-gesture-confirm-payload.js";
import { showEffortConfirmSheet, type EffortConfirmSheetHandle } from "./client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import type { ArrowGesturePoint } from "./client-arrow-gesture-confirm-payload.js";
import type { ClientState } from "./client-state/client-state.js";
import type { FeedSeverity, FeedType } from "./client-types.js";
import { describeMarchWinChance, triggerWinChancePaintOnMarchArm } from "./client-win-chance-paint-trigger.js";
import { createMarchWinChancePreviewPoller, marchPreviewBaseWinChance } from "./client-march-win-chance-preview/client-march-win-chance-preview.js";
import { showCaptureAlert } from "./client-alerts/client-alerts.js";

// F-revision (docs/replenishment-update-plan.md, "the hold-drag gesture is
// replaced by click-to-target"): the confirm sheet shown after a March-To
// target click (client-arrow-gesture-confirm.ts's seam). The sheet's DOM
// (slider, Normal/Extra/Double presets, Escape/Enter handling) is the shared
// effort sheet in client-effort-confirm-sheet.ts -- the same one Launch
// Attack opens -- and this module only adds the
// march-specific parts: the SET_MUSTER payload on "Go", a live win-chance
// line under the slider (describeMarchWinChance), and
// client-win-chance-paint-trigger.ts's label trigger -- called once on open
// and again on every slider/preset change, passing the currently chosen
// commitManpower so the win-chance labels along the arrow are slider-live
// (the old hold-drag version computed them once at the target's base cost
// and never updated them against the chosen commitment). Both score the
// target against the server's march ATTACK_PREVIEW once it arrives
// (client-march-win-chance-preview.ts), re-read on the sheet's refresh tick.

export type ArrowGestureConfirmSheetDeps = {
  sendGameMessage: (payload: unknown) => boolean;
  pushFeed: (msg: string, type?: FeedType, severity?: FeedSeverity) => void;
  renderHud: () => void;
};

/** Slider floor: the target tile's fort requirement if settled, else the generic attack cost -- same rule buildMusterCommitView uses (a held tile's flag commitment is scaled to its own floor server-side, see flagCommitForTarget). */
const floorForTarget = (state: Pick<ClientState, "tiles"> & Partial<Pick<ClientState, "domainIds">>, target: ArrowGesturePoint, keyFor: (x: number, y: number) => string): number => {
  const targetTile = state.tiles.get(keyFor(target.x, target.y));
  return targetTile?.ownershipState === "SETTLED"
    ? attackFloorForPlayer(state, targetTile)
    : MUSTER_ATTACK_COST;
};

/**
 * A march claims neutral land on its way, and each claim is charged to the
 * pool (not the flag) at the current expand cost, which rises with frontier
 * size (runtime-frontier-command.ts) -- on top of what the flag stages. The
 * sheet only spoke of the commitment, so a long march looked like it drained
 * the pool for nothing (2026-11-12 playtest: 943 -> 97 on a 295 commit).
 */
export const claimCostNote = (expandManpowerCost: number | undefined): string =>
  expandManpowerCost && expandManpowerCost > 0 ? ` · each tile claimed on the way costs ${Math.ceil(expandManpowerCost)} more manpower` : "";

let activeHandle: EffortConfirmSheetHandle | undefined;

/** Tears down the confirm sheet if it is the march sheet, without sending anything. Safe to call when none is shown. */
export const hideArrowGestureConfirmSheet = (): void => {
  const handle = activeHandle;
  activeHandle = undefined;
  handle?.close();
};

/**
 * Shows the confirm sheet for a just-confirmed arrow-drag gesture from
 * `origin` to `target`. Clears `state.pendingArrowGestureConfirm` on both
 * "Go" and cancel/dismiss -- there is at most one pending confirm at a time.
 */
export const showArrowGestureConfirmSheet = (
  state: Pick<ClientState, "tiles" | "manpowerCap" | "pendingArrowGestureConfirm" | "arrowGesture" | "me" | "winChancePaint" | "attackPreviewCacheByKey" | "captureAlert"> &
    Partial<Pick<ClientState, "expandManpowerCost">> &
    SupplyWarningState & Partial<Pick<ClientState, "domainIds">>,
  origin: ArrowGesturePoint,
  target: ArrowGesturePoint,
  keyFor: (x: number, y: number) => string,
  deps: ArrowGestureConfirmSheetDeps
): void => {
  const floor = floorForTarget(state, target, keyFor);
  // The march ends in an ATTACK on the target's owner, which ends supply trades with them.
  const marchSupplyWarning = supplyTradeAttackWarningText(state, state.tiles.get(keyFor(target.x, target.y))?.ownerId);
  // Opening this sheet closes any previous one, whose onCancel runs after
  // the caller already stored THIS gesture -- only clear state we own.
  const pending = state.pendingArrowGestureConfirm;
  const gesture = state.arrowGesture;
  const preview = createMarchWinChancePreviewPoller(origin, target, deps.sendGameMessage);
  const serverWinChance = (): number | undefined => marchPreviewBaseWinChance(state, origin, target, keyFor);
  const paint = (commitManpower: number): void =>
    triggerWinChancePaintOnMarchArm(state, origin.x, origin.y, target.x, target.y, "visible", keyFor, performance.now(), {
      committedManpower: commitManpower,
      baseMusterCost: floor
    }, serverWinChance());
  let handle: EffortConfirmSheetHandle | undefined;
  const clearPending = (): void => {
    if (activeHandle === handle) activeHandle = undefined;
    if (state.pendingArrowGestureConfirm === pending) state.pendingArrowGestureConfirm = undefined;
    if (state.arrowGesture === gesture) state.arrowGesture = undefined;
  };
  handle = showEffortConfirmSheet({
    title: `Commit march to (${target.x}, ${target.y})`,
    subtitle: `From (${origin.x}, ${origin.y})${marchSupplyWarning ? ` · ${marchSupplyWarning}` : ""}`,
    floor,
    cap: Math.max(floor, state.manpowerCap),
    mode: "slider",
    describe: (commitManpower) => {
      // Runs on open and every refresh tick: keep the server odds fresh and
      // repaint the arrow labels once they land, not only on slider moves.
      preview.poll();
      paint(commitManpower);
      return `${describeMarchWinChance(state, target, keyFor, { committedManpower: commitManpower, baseMusterCost: floor }, serverWinChance())}${claimCostNote(state.expandManpowerCost)}`;
    },
    onChange: paint,
    onConfirm: (commitManpower) => {
      const sent = deps.sendGameMessage(buildArrowGestureSetMusterPayload(origin, target, commitManpower));
      // Playtest 2026-11-12 (pt-snacker): after Go nothing on screen said the
      // march had left; only the manpower pool falling later did.
      if (sent) {
        const detail = `${commitManpower} manpower from (${origin.x}, ${origin.y}) to (${target.x}, ${target.y})`;
        showCaptureAlert(state, "March sent", detail, "success", undefined, { x: target.x, y: target.y });
        deps.pushFeed(`March sent: ${detail}`, "combat", "info");
      }
      clearPending();
      deps.renderHud();
    },
    onCancel: clearPending
  });
  activeHandle = handle;
};

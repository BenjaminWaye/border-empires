import { MUSTER_ATTACK_COST, requiredMusterForFort } from "@border-empires/shared";
import { buildArrowGestureSetMusterPayload } from "./client-arrow-gesture-confirm-payload.js";
import { showEffortConfirmSheet, type EffortConfirmSheetHandle } from "./client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import type { ArrowGesturePoint } from "./client-arrow-gesture-confirm-payload.js";
import type { ClientState } from "./client-state/client-state.js";
import { triggerWinChancePaintOnMarchArm } from "./client-win-chance-paint-trigger.js";

// F-revision (docs/replenishment-update-plan.md, "the hold-drag gesture is
// replaced by click-to-target"): the confirm sheet shown after a March-To
// target click (client-arrow-gesture-confirm.ts's seam). The sheet's DOM
// (slider, Normal/Extra/Double presets, Escape/Enter handling) is the shared
// effort sheet in client-effort-confirm-sheet.ts -- the same one Launch
// Attack and Expand To & Attack open -- and this module only adds the
// march-specific parts: the SET_MUSTER payload on "Go" and
// client-win-chance-paint-trigger.ts's label trigger -- called once on open
// and again on every slider/preset change, passing the currently chosen
// commitManpower so the win-chance labels along the arrow are slider-live
// (the old hold-drag version computed them once at the target's base cost
// and never updated them against the chosen commitment).

export type ArrowGestureConfirmSheetDeps = {
  sendGameMessage: (payload: unknown) => boolean;
  renderHud: () => void;
};

/** Slider floor: the target tile's fort requirement if settled, else the generic attack cost -- same rule buildMusterCommitView uses. */
const floorForTarget = (state: Pick<ClientState, "tiles">, target: ArrowGesturePoint, keyFor: (x: number, y: number) => string): number => {
  const targetTile = state.tiles.get(keyFor(target.x, target.y));
  return targetTile?.ownershipState === "SETTLED"
    ? requiredMusterForFort(targetTile.fort?.status === "active" ? targetTile.fort.variant : undefined)
    : MUSTER_ATTACK_COST;
};

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
  state: Pick<ClientState, "tiles" | "manpowerCap" | "pendingArrowGestureConfirm" | "arrowGesture" | "me" | "winChancePaint">,
  origin: ArrowGesturePoint,
  target: ArrowGesturePoint,
  keyFor: (x: number, y: number) => string,
  deps: ArrowGestureConfirmSheetDeps
): void => {
  const floor = floorForTarget(state, target, keyFor);
  // Opening this sheet closes any previous one, whose onCancel runs after
  // the caller already stored THIS gesture -- only clear state we own.
  const pending = state.pendingArrowGestureConfirm;
  const gesture = state.arrowGesture;
  let handle: EffortConfirmSheetHandle | undefined;
  const clearPending = (): void => {
    if (activeHandle === handle) activeHandle = undefined;
    if (state.pendingArrowGestureConfirm === pending) state.pendingArrowGestureConfirm = undefined;
    if (state.arrowGesture === gesture) state.arrowGesture = undefined;
  };
  handle = showEffortConfirmSheet({
    title: `Commit march to (${target.x}, ${target.y})`,
    subtitle: `From (${origin.x}, ${origin.y})`,
    floor,
    cap: Math.max(floor, state.manpowerCap),
    mode: "slider",
    onChange: (commitManpower) =>
      triggerWinChancePaintOnMarchArm(state, origin.x, origin.y, target.x, target.y, "visible", keyFor, performance.now(), {
        committedManpower: commitManpower,
        baseMusterCost: floor
      }),
    onConfirm: (commitManpower) => {
      deps.sendGameMessage(buildArrowGestureSetMusterPayload(origin, target, commitManpower));
      clearPending();
      deps.renderHud();
    },
    onCancel: clearPending
  });
  activeHandle = handle;
};

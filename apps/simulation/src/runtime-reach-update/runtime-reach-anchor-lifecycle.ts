import type { ReachAnchor } from "@border-empires/shared";
import { applyReachAnchorActivationToBorder, applyReachAnchorDeactivationToBorder, type OnBorderMutated, type ReachAnchorActivationResult, type ReachBorderApplyContext } from "./runtime-reach-border-apply.js";
import type { ReachUpdateState } from "./runtime-reach-update.js";
import { diffReachBorder, type ReachBorderChange } from "../reach-border-snapshot/reach-border-snapshot.js";
export { syncReachVision } from "../reach-border-vision.js";

/**
 * The full effect of an anchor activation/deactivation: border mutation plus
 * the reach-vision sync and the persisted REACH_BORDER_CHANGED diff (one
 * anchor change only ever touches its own disk). Pulled out of Runtime so its two call sites
 * (applyReachAnchorActivation / applyReachAnchorDeactivation) stay one-liners
 * instead of growing the already-oversized runtime.ts further.
 */
export type ReachAnchorLifecycleDeps = {
  /** The runtime's live border; both paths mutate it in place. */
  reachBorder: Map<string, string>;
  reachUpdateState: ReachUpdateState;
  reachBorderApplyContext: ReachBorderApplyContext;
  syncReachVision: (oldBorder: ReadonlyMap<string, string>, newBorder: ReadonlyMap<string, string>, changedKeys: Iterable<string>) => void;
  /** Persists a non-empty border diff so startup recovery can replay it. */
  emitBorderChanges: (changes: ReachBorderChange[], ownerId: string, causeCommandId: string) => void;
};

const recordBorderEffects = (deps: ReachAnchorLifecycleDeps, anchor: ReachAnchor, causeCommandId: string): OnBorderMutated =>
  (before, diskKeys) => {
    deps.syncReachVision(before, deps.reachBorder, diskKeys);
    const changes = diffReachBorder(before, deps.reachBorder, diskKeys);
    if (changes.length > 0) deps.emitBorderChanges(changes, anchor.ownerId, causeCommandId);
  };

export const applyReachAnchorActivationEffects = (
  deps: ReachAnchorLifecycleDeps,
  anchor: ReachAnchor,
  causeCommandId: string,
  options?: { skipNeutralAutoClaim?: boolean }
): ReachAnchorActivationResult =>
  applyReachAnchorActivationToBorder(deps.reachBorder, anchor, deps.reachUpdateState, deps.reachBorderApplyContext, causeCommandId, options, recordBorderEffects(deps, anchor, causeCommandId));

export const applyReachAnchorDeactivationEffects = (
  deps: ReachAnchorLifecycleDeps,
  anchor: ReachAnchor,
  causeCommandId: string
): Map<string, string> =>
  applyReachAnchorDeactivationToBorder(deps.reachBorder, anchor, deps.reachUpdateState, deps.reachBorderApplyContext, causeCommandId, recordBorderEffects(deps, anchor, causeCommandId));

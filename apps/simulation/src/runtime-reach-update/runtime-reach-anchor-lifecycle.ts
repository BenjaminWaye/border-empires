import { tileKeysInReach, type LandConnectivityQuery, type ReachAnchor } from "@border-empires/shared";
import { applyReachAnchorActivationToBorder, applyReachAnchorDeactivationToBorder, type ReachAnchorActivationResult, type ReachBorderApplyContext } from "./runtime-reach-border-apply.js";
import type { ReachUpdateState } from "./runtime-reach-update.js";
export { syncReachVision } from "../reach-border-vision.js";

/**
 * The full effect of an anchor activation/deactivation: border mutation plus
 * the reach-vision sync. Pulled out of Runtime so its two call sites
 * (applyReachAnchorActivation / applyReachAnchorDeactivation) stay one-liners
 * instead of growing the already-oversized runtime.ts further.
 */
export type ReachAnchorLifecycleDeps = {
  reachBorder: ReadonlyMap<string, string>;
  reachUpdateState: ReachUpdateState;
  reachBorderApplyContext: ReachBorderApplyContext;
  isLandTile?: LandConnectivityQuery;
  syncReachVision: (oldBorder: ReadonlyMap<string, string>, newBorder: ReadonlyMap<string, string>, changedKeys: Iterable<string>) => void;
};

export const applyReachAnchorActivationEffects = (
  deps: ReachAnchorLifecycleDeps,
  anchor: ReachAnchor,
  causeCommandId: string,
  options?: { skipNeutralAutoClaim?: boolean }
): ReachAnchorActivationResult => {
  const result = applyReachAnchorActivationToBorder(deps.reachBorder, anchor, deps.reachUpdateState, deps.reachBorderApplyContext, causeCommandId, options);
  deps.syncReachVision(deps.reachBorder, result.border, tileKeysInReach(anchor, deps.isLandTile));
  return result;
};

export const applyReachAnchorDeactivationEffects = (
  deps: ReachAnchorLifecycleDeps,
  anchor: ReachAnchor,
  causeCommandId: string
): Map<string, string> => {
  const nextBorder = applyReachAnchorDeactivationToBorder(deps.reachBorder, anchor, deps.reachUpdateState, deps.reachBorderApplyContext, causeCommandId);
  deps.syncReachVision(deps.reachBorder, nextBorder, tileKeysInReach(anchor, deps.isLandTile));
  return nextBorder;
};

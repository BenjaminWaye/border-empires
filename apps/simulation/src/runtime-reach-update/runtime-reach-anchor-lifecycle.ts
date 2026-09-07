import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { isInReach, type LandConnectivityQuery, type ReachAnchor } from "@border-empires/shared";
import type { SimulationTileWireDelta } from "../runtime-types.js";
import { applyReachAnchorActivationToBorder, applyReachAnchorDeactivationToBorder, type ReachBorderApplyContext } from "./runtime-reach-border-apply.js";
import type { ReachUpdateState } from "./runtime-reach-update.js";
import { cancelOutOfReachDecayInAnchorDisk, stampOutOfReachDecayInAnchorDisk } from "./runtime-reach-out-of-reach.js";

/**
 * The full effect of an anchor activation/deactivation: border mutation plus
 * the out-of-reach decay side effect each one carries (reach caught up ->
 * cancel; reach retreated -> stamp). Pulled out of Runtime so its two call
 * sites (applyReachAnchorActivation / applyReachAnchorDeactivation) stay
 * one-liners instead of growing the already-oversized runtime.ts further.
 */
export type ReachAnchorLifecycleDeps = {
  reachBorder: ReadonlyMap<string, string>;
  reachUpdateState: ReachUpdateState;
  reachBorderApplyContext: ReachBorderApplyContext;
  tiles: Map<string, DomainTileState>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  tileDeltaFromState: (tile: DomainTileState) => SimulationTileWireDelta;
  emitEvent: (event: SimulationEvent) => void;
  isLandTile?: LandConnectivityQuery;
  now: () => number;
  gatherReachAnchors: () => ReachAnchor[];
  registerOutOfReachDecay: (tileKey: string, deadlineAt: number) => void;
};

export const applyReachAnchorActivationEffects = (
  deps: ReachAnchorLifecycleDeps,
  anchor: ReachAnchor,
  causeCommandId: string,
  options?: { skipNeutralAutoClaim?: boolean }
): Map<string, string> => {
  const nextBorder = applyReachAnchorActivationToBorder(deps.reachBorder, anchor, deps.reachUpdateState, deps.reachBorderApplyContext, causeCommandId, options);
  // Reach caught up over this anchor's disk: anything decaying there for being out of reach is now held ground. O(radius²), not a sweep.
  cancelOutOfReachDecayInAnchorDisk(deps, anchor, causeCommandId);
  return nextBorder;
};

export const applyReachAnchorDeactivationEffects = (
  deps: ReachAnchorLifecycleDeps,
  anchor: ReachAnchor,
  causeCommandId: string
): Map<string, string> => {
  const nextBorder = applyReachAnchorDeactivationToBorder(deps.reachBorder, anchor, deps.reachUpdateState, deps.reachBorderApplyContext, causeCommandId);
  // Reach just retreated over this anchor's disk (Relay Beacon/outpost/town/dock lost): anything left in genuine no-man's-land there needs a decay deadline it never got at claim time. O(radius²), not a sweep.
  // isPlayerTileInReach MUST read nextBorder, not deps.reachBorder (the pre-deactivation border) -- deps has no border-derived closure of its own precisely so this can't be gotten wrong by accident.
  stampOutOfReachDecayInAnchorDisk({ ...deps, isPlayerTileInReach: (playerId, x, y) => isInReach(playerId, x, y, nextBorder) }, anchor, causeCommandId);
  return nextBorder;
};

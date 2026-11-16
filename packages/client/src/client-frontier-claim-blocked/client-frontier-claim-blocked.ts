import type { ClientState } from "../client-state/client-state.js";

// Explains why a frontier claim could not be queued, in the game's own voice.
// The old copy ("must touch your territory and you need enough coin") was
// shown for every failure, even though frontier claims cost no coin
// (FRONTIER_CLAIM_COST = 0) and the real cause was usually a retry cooldown
// or a tile already on its way to being claimed.

export const FRONTIER_CLAIM_BLOCKED_TITLE = "Settlers held back";

export const frontierClaimBlockedMessage = (
  state: Pick<ClientState, "frontierSyncWaitUntilByTarget" | "queuedTargetKeys">,
  targetKeys: readonly string[],
  now: number = Date.now()
): string => {
  if (targetKeys.length > 0 && targetKeys.every((key) => state.queuedTargetKeys.has(key))) {
    return targetKeys.length === 1 ? "Settlers are already on their way there." : "Settlers are already on their way to those lands.";
  }
  if (targetKeys.some((key) => (state.frontierSyncWaitUntilByTarget.get(key) ?? 0) > now)) {
    return "Your settlers are regrouping after the last attempt. Try again in a moment.";
  }
  return targetKeys.length === 1
    ? "That land lies beyond your borders. Claim the land between first."
    : "Those lands lie beyond your borders. Claim the land between first.";
};

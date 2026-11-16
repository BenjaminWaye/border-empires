import type { ClientState } from "../client-state/client-state.js";
import { showVisibleActionWarning, type VisibleActionWarningDeps } from "../client-visible-action-warning.js";

// Explains why a frontier claim could not be queued, in the game's own voice.
// The old copy ("must touch your territory and you need enough coin") was
// shown for every failure, even though frontier claims cost no coin
// (FRONTIER_CLAIM_COST = 0) and the real cause was usually a short dispatch
// wait or a tile already on its way to being claimed.

export const FRONTIER_CLAIM_BLOCKED_TITLE = "Settlers held back";

export const frontierClaimBlockedMessage = (
  state: Pick<ClientState, "frontierSyncWaitUntilByTarget" | "queuedTargetKeys">,
  targetKeys: readonly string[],
  now: number = Date.now()
): string => {
  const single = targetKeys.length === 1;
  const notQueued = targetKeys.filter((key) => !state.queuedTargetKeys.has(key));
  if (targetKeys.length > 0 && notQueued.length === 0) {
    return single ? "Settlers are already on their way there." : "Settlers are already on their way to those lands.";
  }
  // Only blame the short wait when it explains every target still left;
  // otherwise "try again in a moment" would fail again for the rest.
  if (notQueued.length > 0 && notQueued.every((key) => (state.frontierSyncWaitUntilByTarget.get(key) ?? 0) > now)) {
    return "Your settlers are still getting ready. Try again in a moment.";
  }
  return single
    ? "That land lies beyond your borders. Claim the land between first."
    : "Those lands lie beyond your borders. Claim the land between first.";
};

// Bulk "settle" outcome: one feed line when anything was queued, otherwise
// the prominent warning with the real reason.
export const reportBulkFrontierClaim = (
  state: Pick<ClientState, "frontierSyncWaitUntilByTarget" | "queuedTargetKeys">,
  out: { queued: number; skipped: number },
  targetKeys: readonly string[],
  deps: VisibleActionWarningDeps
): void => {
  if (out.queued <= 0) {
    showVisibleActionWarning(deps, FRONTIER_CLAIM_BLOCKED_TITLE, frontierClaimBlockedMessage(state, targetKeys));
    return;
  }
  deps.pushFeed(`Queued ${out.queued} frontier captures${out.skipped > 0 ? ` (${out.skipped} unreachable)` : ""}.`, "combat", "info");
};

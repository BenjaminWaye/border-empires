import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { clearMusterTransitForTarget } from "../client-muster-transit/client-muster-transit.js";
import type { ClientState } from "../client-state/client-state.js";

// Split out of client-network.ts's ERROR handler (over the repo's 500-line
// growth cap): tears down this client's single in-flight frontier action
// after the server rejected it.
export const resetFrontierActionStateAfterError = (
  state: ClientState,
  input: {
    errorCode: string;
    cooldownRemainingMs: unknown;
    failedCurrentKey: string;
    failedTargetKey: string;
    clearLateFrontierAck: (tileKey: string) => void;
  }
): void => {
  const { errorCode, failedCurrentKey, failedTargetKey } = input;
  const failedAction = state.actionCurrent;
  state.capture = undefined;
  if (state.pendingCombatReveal?.targetKey === failedCurrentKey) state.pendingCombatReveal = undefined;
  state.actionInFlight = false;
  state.actionAcceptedAck = false;
  state.combatStartAck = false;
  state.actionAcceptTimeoutHandledAt = 0;
  state.actionStartedAt = 0;
  state.actionTargetKey = "";
  state.actionCurrent = undefined;
  // A muster-funded attack keeps its flag's transit entry (now in "locked"
  // phase) until its combat result arrives -- which a rejected command never
  // gets. Left behind, findClosestMuster skips the flag as busy, so the next
  // attack from it parks as "mustering" while the flag keeps filling past
  // what's needed, until the 30s orphan prune in fireDueMusterTransits
  // finally frees it (seen as mustering 70/60 climbing to 120+).
  if (failedAction) clearMusterTransitForTarget(state, failedAction.x, failedAction.y);
  input.clearLateFrontierAck(failedCurrentKey);
  input.clearLateFrontierAck(failedTargetKey);
  if (errorCode === "ATTACK_COOLDOWN" || errorCode === "DOCK_COOLDOWN") {
    const cooldownBackoffMs =
      typeof input.cooldownRemainingMs === "number" && Number.isFinite(input.cooldownRemainingMs)
        ? Math.max(0, input.cooldownRemainingMs)
        : COMBAT_LOCK_MS;
    if (failedCurrentKey) state.frontierSyncWaitUntilByTarget.set(failedCurrentKey, Date.now() + cooldownBackoffMs);
    if (failedTargetKey) state.frontierSyncWaitUntilByTarget.set(failedTargetKey, Date.now() + cooldownBackoffMs);
  }
  if (errorCode === "LOCKED") {
    if (failedCurrentKey) state.frontierSyncWaitUntilByTarget.set(failedCurrentKey, Date.now() + 12_000);
    if (failedTargetKey) state.frontierSyncWaitUntilByTarget.set(failedTargetKey, Date.now() + 12_000);
  }
};

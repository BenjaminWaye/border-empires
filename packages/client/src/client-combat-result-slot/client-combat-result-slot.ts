import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { clearMusterTransitForTarget } from "../client-muster-transit/client-muster-transit.js";
import type { ClientState } from "../client-state/client-state.js";

// Split out of client-network.ts's applyCombatOutcomeMessage (over the repo's
// 500-line cap): what a COMBAT_RESULT does to this client's own attack
// bookkeeping once the tile changes and alerts are applied.
//
// Two cases:
// - the attack still holds the single dispatch slot (state.capture /
//   actionInFlight / actionCurrent): free the slot and start the next action.
// - a detached attack (client-detached-attacks.ts) that already left the
//   slot when the server locked it: only its own target's bookkeeping is
//   touched, so a result never interrupts whatever is in the slot now.

export type CombatResultSlotDeps = {
  keyFor: (x: number, y: number) => string;
  requestSettlement: (x: number, y: number) => boolean;
  pushFeed: (message: string, type?: "combat" | "mission" | "error" | "info" | "alliance" | "tech", severity?: "info" | "success" | "warn" | "error") => void;
  dropQueuedTargetKeyIfAbsent: (targetKey: string) => void;
  resumeQueuedFrontierActionsAfter: (delayMs: number) => void;
  processActionQueue: () => boolean;
};

export type CombatResultSlotInput = {
  attackType: unknown;
  target: { x: number; y: number } | undefined;
  resultTargetKey: string;
  resultAlert: { title: string; detail: string };
  /** state.capture's target key from before the result was applied. */
  resolvedCaptureTargetKey: string;
  predicted: boolean;
  detached: boolean;
};

/** Hands a captured tile queued for auto-garrison over to SETTLE. Returns true when it did. */
const handOffAutoSettle = (state: ClientState, targetKey: string, deps: CombatResultSlotDeps): boolean => {
  if (!targetKey || !state.autoSettleTargets.has(targetKey)) return false;
  let handedOff = false;
  const settledTile = state.tiles.get(targetKey);
  if (settledTile && settledTile.ownerId === state.me && settledTile.ownershipState === "FRONTIER") {
    if (deps.requestSettlement(settledTile.x, settledTile.y)) {
      handedOff = true;
      deps.pushFeed(`Auto-garrison started at (${settledTile.x}, ${settledTile.y}).`, "combat", "info");
    }
  }
  state.autoSettleTargets.delete(targetKey);
  return handedOff;
};

export const settleCombatResultSlot = (state: ClientState, input: CombatResultSlotInput, deps: CombatResultSlotDeps): void => {
  const { resultTargetKey } = input;
  if (resultTargetKey) {
    if (input.predicted) state.revealedPredictedCombatByKey.set(resultTargetKey, { title: input.resultAlert.title, detail: input.resultAlert.detail });
    else state.revealedPredictedCombatByKey.delete(resultTargetKey);
  }
  if (state.pendingCombatReveal && state.pendingCombatReveal.targetKey === resultTargetKey) state.pendingCombatReveal = undefined;
  // Only this attack's march/reservation -- other flags' attacks keep theirs.
  if (input.target) clearMusterTransitForTarget(state, input.target.x, input.target.y);
  if (input.detached) {
    if (!handOffAutoSettle(state, resultTargetKey, deps) && resultTargetKey) state.autoBuildTargets.delete(resultTargetKey);
    if (resultTargetKey) deps.dropQueuedTargetKeyIfAbsent(resultTargetKey);
    return;
  }
  const resolvedCurrentKey = state.actionCurrent ? deps.keyFor(state.actionCurrent.x, state.actionCurrent.y) : "";
  const targetKey = input.resolvedCaptureTargetKey || state.actionTargetKey;
  const handedOffToSettle = handOffAutoSettle(state, targetKey, deps);
  state.capture = undefined;
  if (handedOffToSettle) return;
  if (targetKey) state.autoBuildTargets.delete(targetKey);
  state.actionInFlight = false;
  state.actionAcceptedAck = false;
  state.combatStartAck = false;
  state.actionAcceptTimeoutHandledAt = 0;
  state.actionStartedAt = 0;
  if (targetKey) deps.dropQueuedTargetKeyIfAbsent(targetKey);
  if (resolvedCurrentKey) deps.dropQueuedTargetKeyIfAbsent(resolvedCurrentKey);
  let startedNext = false;
  if (input.attackType === "ATTACK" && state.actionQueue.length > 0) {
    deps.resumeQueuedFrontierActionsAfter(COMBAT_LOCK_MS);
  } else {
    startedNext = deps.processActionQueue();
  }
  if (!startedNext) {
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
  }
};

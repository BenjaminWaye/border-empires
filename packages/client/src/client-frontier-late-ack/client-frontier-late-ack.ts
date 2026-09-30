import { attackSyncLog } from "../client-debug/client-debug.js";
import { matchesCurrentFrontierCommand } from "../client-frontier-command/client-frontier-command.js";
import type { ClientState } from "../client-state/client-state.js";

type LateAckState = Pick<
  ClientState,
  "actionCurrent" | "actionInFlight" | "actionStartedAt" | "actionTargetKey" | "frontierLateAckUntilByTarget"
>;

export interface LateFrontierAckDeps {
  state: LateAckState;
  keyFor: (x: number, y: number) => string;
}

export interface LateFrontierAckHandlers {
  lateFrontierAckPending: (tileKey: string) => boolean;
  clearLateFrontierAck: (tileKey: string) => void;
  rebindLateFrontierAck: (
    target: { x: number; y: number },
    source: "ACTION_ACCEPTED" | "COMBAT_START",
    actionType?: "EXPAND" | "ATTACK"
  ) => void;
  /**
   * ACTION_ACCEPTED for a frontier action the client already gave up waiting on.
   * The 2s accept timeout clears actionCurrent and opens a 12s
   * frontierLateAckUntilByTarget window precisely so a slow-but-successful accept
   * can be re-adopted by rebindLateFrontierAck. matchesCurrentFrontierCommand with
   * requireActionInFlight rejects everything while actionCurrent is undefined,
   * though, so the ack used to be dropped before the rebind ran and the tile sat
   * on "Expansion sync delayed".
   */
  matchesCurrentOrLateFrontierAck: (message: { commandId?: unknown; target?: unknown }) => boolean;
}

export const createLateFrontierAckHandlers = ({ state, keyFor }: LateFrontierAckDeps): LateFrontierAckHandlers => {
  const lateFrontierAckPending = (tileKey: string): boolean => (state.frontierLateAckUntilByTarget.get(tileKey) ?? 0) > Date.now();

  const clearLateFrontierAck = (tileKey: string): void => {
    if (!tileKey) return;
    state.frontierLateAckUntilByTarget.delete(tileKey);
  };

  const rebindLateFrontierAck: LateFrontierAckHandlers["rebindLateFrontierAck"] = (target, source, actionType) => {
    const targetKey = keyFor(target.x, target.y);
    const lateAckUntil = state.frontierLateAckUntilByTarget.get(targetKey) ?? 0;
    if (!lateFrontierAckPending(targetKey)) return;
    state.actionInFlight = true;
    state.actionTargetKey = targetKey;
    if (!state.actionCurrent || keyFor(state.actionCurrent.x, state.actionCurrent.y) !== targetKey) {
      state.actionCurrent = { x: target.x, y: target.y, retries: 0, ...(actionType ? { actionType } : {}) };
    } else if (actionType) {
      state.actionCurrent.actionType = actionType;
    }
    if (!state.actionStartedAt) state.actionStartedAt = Date.now();
    clearLateFrontierAck(targetKey);
    attackSyncLog("late-frontier-ack-rebound", {
      source,
      target,
      targetKey,
      lateAckWaitRemainingMs: Math.max(0, lateAckUntil - Date.now())
    });
  };

  const matchesCurrentOrLateFrontierAck: LateFrontierAckHandlers["matchesCurrentOrLateFrontierAck"] = (message) => {
    if (matchesCurrentFrontierCommand(state, message.commandId, true)) return true;
    if (state.actionCurrent) return false;
    const target = message.target as { x?: unknown; y?: unknown } | undefined;
    if (!target || typeof target.x !== "number" || typeof target.y !== "number") return false;
    return lateFrontierAckPending(keyFor(target.x, target.y));
  };

  return { lateFrontierAckPending, clearLateFrontierAck, rebindLateFrontierAck, matchesCurrentOrLateFrontierAck };
};

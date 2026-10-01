import { BARBARIAN_INFLIGHT_TIMEOUT_MS } from "@border-empires/shared";

/**
 * Tells the barbarian planner (in the worker) when a command it issued has
 * finished, so the tile's rest period can start from that moment instead of
 * from when the command was issued (combat locks for 30s, so counting from
 * issue leaves no rest between fights).
 *
 * Settle events seen in the simulation event stream:
 *   ATTACK / EXPAND   -> COMBAT_RESOLVED (7.5s for a claim, 30s for a fight)
 *   UNCAPTURE_TILE    -> COMMAND_RESOLVED
 *   any invalid input -> COMMAND_REJECTED
 *   cancelled locks   -> COMBAT_CANCELLED (carries cancelledCommandIds)
 */
export type BarbSettleRelayDeps = {
  readonly barbPlayerId: string;
  readonly postToWorker: (msg: { type: "barb_settled"; commandId: string; settledAt: number }) => void;
  readonly now: () => number;
};

export type BarbSettleEvent = {
  readonly eventType: string;
  readonly playerId: string;
  readonly commandId?: string;
  readonly cancelledCommandIds?: readonly string[];
};

const SETTLING_EVENT_TYPES: ReadonlySet<string> = new Set(["COMBAT_RESOLVED", "COMMAND_REJECTED", "COMMAND_RESOLVED"]);

export const createBarbSettleRelay = (deps: BarbSettleRelayDeps) => {
  // Command ids the producer submitted that haven't settled yet. Bounded: an
  // entry older than the in-flight timeout is dropped (the planner expires its
  // own copy at the same age).
  const submittedAtByCommandId = new Map<string, number>();

  const settle = (commandId: string): void => {
    if (!submittedAtByCommandId.delete(commandId)) return;
    deps.postToWorker({ type: "barb_settled", commandId, settledAt: deps.now() });
  };

  return {
    onSubmitted(commandId: string): void {
      const t = deps.now();
      for (const [id, at] of submittedAtByCommandId) {
        if (t - at >= BARBARIAN_INFLIGHT_TIMEOUT_MS) submittedAtByCommandId.delete(id);
      }
      submittedAtByCommandId.set(commandId, t);
    },
    onEvent(event: BarbSettleEvent): void {
      if (event.playerId !== deps.barbPlayerId || submittedAtByCommandId.size === 0) return;
      if (SETTLING_EVENT_TYPES.has(event.eventType) && event.commandId) settle(event.commandId);
      else if (event.eventType === "COMBAT_CANCELLED") for (const id of event.cancelledCommandIds ?? []) settle(id);
    },
    /** Worker respawned: its planner has no in-flight state any more. */
    clear(): void {
      submittedAtByCommandId.clear();
    },
    size: (): number => submittedAtByCommandId.size
  };
};

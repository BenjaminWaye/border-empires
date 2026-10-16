// Pays out a truce/alliance deal's terms in the simulation and waits for its
// verdict. The simulation's SUBMIT ack only means "durably queued"; whether
// both sides could actually pay arrives later on the event stream as
// COMMAND_RESOLVED / COMMAND_REJECTED, which observe() routes back here.
//
// A settlement the gateway gave up on (timeout, or a submit that errored but
// may still have been queued) can still be applied by the simulation later.
// The caller has already been told the deal failed, so no agreement will be
// recorded: such a late payment is paid straight back (see `abandoned`).
import crypto from "node:crypto";

import { diplomacyTermsAreEmpty, swapDiplomacyTerms, type DiplomacyTerms } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

/** Command-id prefix; the gateway's own COMMAND_REJECTED fan-out skips these (no raw ERROR to players). */
export const DIPLOMACY_SETTLEMENT_COMMAND_PREFIX = "diplomacy-settle:";
/** Generous: once queued, the simulation always answers; this only guards a lost event. */
export const DIPLOMACY_SETTLEMENT_TIMEOUT_MS = 30_000;
/** Bound on in-flight settlements (state discipline); each is one player's accept click. */
export const MAX_PENDING_DIPLOMACY_SETTLEMENTS = 500;
/** How long a given-up settlement is watched for a late payment to refund, and how many at once. */
export const ABANDONED_SETTLEMENT_WATCH_MS = 15 * 60_000;
export const MAX_ABANDONED_DIPLOMACY_SETTLEMENTS = 500;

export type DiplomacySettlementResult = { ok: true } | { ok: false; message: string };

export type DiplomacySettlementInput = {
  proposerId: string;
  targetId: string;
  terms: DiplomacyTerms;
  /**
   * Refund the payment if the simulation applies it after we gave up (default
   * true). Refunds themselves pass false, so a late refund is never reversed.
   */
  refundIfLate?: boolean;
};

export type DiplomacySettlementDeps = {
  submitCommand: (command: CommandEnvelope) => Promise<unknown>;
  isSimulationConnected: () => boolean;
  now: () => number;
  setTimer: (task: () => void, delayMs: number) => { clear: () => void };
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  timeoutMs?: number;
};

export type DiplomacySettlement = {
  settle: (input: DiplomacySettlementInput) => Promise<DiplomacySettlementResult>;
  /** Feed every simulation event through here. */
  observe: (event: { eventType: string; commandId?: string; message?: string }) => void;
  pendingCount: () => number;
  abandonedCount: () => number;
};

type Abandoned = { proposerId: string; targetId: string; terms: DiplomacyTerms; at: number };

export const createDiplomacySettlement = (deps: DiplomacySettlementDeps): DiplomacySettlement => {
  const pending = new Map<string, { resolve: (result: DiplomacySettlementResult) => void; timer: { clear: () => void }; abandon?: Abandoned }>();
  const abandoned = new Map<string, Abandoned>();

  const finish = (commandId: string, result: DiplomacySettlementResult): void => {
    const entry = pending.get(commandId);
    if (!entry) return;
    pending.delete(commandId);
    entry.timer.clear();
    entry.resolve(result);
  };

  // Gave up without a verdict: remember the deal in case the payment still lands.
  const giveUp = (commandId: string, result: DiplomacySettlementResult): void => {
    const watch = pending.get(commandId)?.abandon;
    if (watch) {
      const cutoff = deps.now() - ABANDONED_SETTLEMENT_WATCH_MS;
      for (const [id, entry] of abandoned) {
        if (entry.at < cutoff || abandoned.size >= MAX_ABANDONED_DIPLOMACY_SETTLEMENTS) abandoned.delete(id);
        else break; // insertion order = age order
      }
      abandoned.set(commandId, { ...watch, at: deps.now() });
    }
    finish(commandId, result);
  };

  const refundLatePayment = (commandId: string, deal: Abandoned): void => {
    void settle({ proposerId: deal.proposerId, targetId: deal.targetId, terms: swapDiplomacyTerms(deal.terms), refundIfLate: false }).then((refund) => {
      deps.recordGatewayEvent(refund.ok ? "warn" : "error", "gateway_diplomacy_settlement_late_refund", {
        commandId,
        proposerId: deal.proposerId,
        targetId: deal.targetId,
        refunded: refund.ok
      });
    });
  };

  const settle = async ({ proposerId, targetId, terms, refundIfLate = true }: DiplomacySettlementInput): Promise<DiplomacySettlementResult> => {
    if (diplomacyTermsAreEmpty(terms)) return { ok: true };
    if (!deps.isSimulationConnected()) return { ok: false, message: "The world is unavailable right now. Try again shortly." };
    if (pending.size >= MAX_PENDING_DIPLOMACY_SETTLEMENTS) {
      deps.recordGatewayEvent("warn", "gateway_diplomacy_settlement_busy", { pending: pending.size });
      return { ok: false, message: "Too many deals are settling right now. Try again shortly." };
    }
    const commandId = `${DIPLOMACY_SETTLEMENT_COMMAND_PREFIX}${crypto.randomUUID()}`;
    // Register before submitting: the verdict can arrive before the submit ack does.
    const outcome = new Promise<DiplomacySettlementResult>((resolve) => {
      const timer = deps.setTimer(() => {
        deps.recordGatewayEvent("warn", "gateway_diplomacy_settlement_timeout", { commandId, proposerId, targetId });
        giveUp(commandId, { ok: false, message: "The deal timed out before it could be paid. Try again." });
      }, deps.timeoutMs ?? DIPLOMACY_SETTLEMENT_TIMEOUT_MS);
      pending.set(commandId, { resolve, timer, ...(refundIfLate ? { abandon: { proposerId, targetId, terms, at: 0 } } : {}) });
    });
    try {
      await deps.submitCommand({
        commandId,
        sessionId: "system-runtime:social",
        playerId: targetId,
        clientSeq: 0,
        issuedAt: deps.now(),
        type: "SETTLE_DIPLOMACY_TERMS",
        payloadJson: JSON.stringify({ proposerId, targetId, proposerPays: terms.give, targetPays: terms.ask })
      });
    } catch (error) {
      deps.recordGatewayEvent("warn", "gateway_diplomacy_settlement_submit_failed", {
        commandId,
        error: error instanceof Error ? error.message : String(error)
      });
      // A submit timeout doesn't mean the command never reached the simulation.
      giveUp(commandId, { ok: false, message: "The world is unavailable right now. Try again shortly." });
    }
    const result = await outcome;
    deps.recordGatewayEvent("info", "gateway_diplomacy_settlement", { commandId, proposerId, targetId, ok: result.ok });
    return result;
  };

  return {
    settle,
    observe: (event) => {
      if (!event.commandId?.startsWith(DIPLOMACY_SETTLEMENT_COMMAND_PREFIX)) return;
      const late = abandoned.get(event.commandId);
      if (late) {
        abandoned.delete(event.commandId);
        if (event.eventType === "COMMAND_RESOLVED") refundLatePayment(event.commandId, late);
        return;
      }
      if (event.eventType === "COMMAND_RESOLVED") finish(event.commandId, { ok: true });
      if (event.eventType === "COMMAND_REJECTED") {
        finish(event.commandId, { ok: false, message: event.message ? `The deal fell through: ${event.message}.` : "The deal fell through." });
      }
    },
    pendingCount: () => pending.size,
    abandonedCount: () => abandoned.size
  };
};

// Pays out a truce/alliance deal's terms in the simulation and waits for its
// verdict. The simulation's SUBMIT ack only means "durably queued"; whether
// both sides could actually pay arrives later on the event stream as
// COMMAND_RESOLVED / COMMAND_REJECTED, which observe() routes back here.
import crypto from "node:crypto";

import { diplomacyTermsAreEmpty, type DiplomacyTerms } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

/** Command-id prefix; the gateway's own COMMAND_REJECTED fan-out skips these (no raw ERROR to players). */
export const DIPLOMACY_SETTLEMENT_COMMAND_PREFIX = "diplomacy-settle:";
/** Generous: once queued, the simulation always answers; this only guards a lost event. */
export const DIPLOMACY_SETTLEMENT_TIMEOUT_MS = 30_000;
/** Bound on in-flight settlements (state discipline); each is one player's accept click. */
export const MAX_PENDING_DIPLOMACY_SETTLEMENTS = 500;

export type DiplomacySettlementResult = { ok: true } | { ok: false; message: string };

export type DiplomacySettlementDeps = {
  submitCommand: (command: CommandEnvelope) => Promise<unknown>;
  isSimulationConnected: () => boolean;
  now: () => number;
  setTimer: (task: () => void, delayMs: number) => { clear: () => void };
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  timeoutMs?: number;
};

export type DiplomacySettlement = {
  settle: (input: { proposerId: string; targetId: string; terms: DiplomacyTerms }) => Promise<DiplomacySettlementResult>;
  /** Feed every simulation event through here. */
  observe: (event: { eventType: string; commandId?: string; message?: string }) => void;
  pendingCount: () => number;
};

export const createDiplomacySettlement = (deps: DiplomacySettlementDeps): DiplomacySettlement => {
  const pending = new Map<string, { resolve: (result: DiplomacySettlementResult) => void; timer: { clear: () => void } }>();
  const finish = (commandId: string, result: DiplomacySettlementResult): void => {
    const entry = pending.get(commandId);
    if (!entry) return;
    pending.delete(commandId);
    entry.timer.clear();
    entry.resolve(result);
  };

  return {
    settle: async ({ proposerId, targetId, terms }) => {
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
          finish(commandId, { ok: false, message: "The deal timed out before it could be paid. Try again." });
        }, deps.timeoutMs ?? DIPLOMACY_SETTLEMENT_TIMEOUT_MS);
        pending.set(commandId, { resolve, timer });
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
        finish(commandId, { ok: false, message: "The world is unavailable right now. Try again shortly." });
      }
      const result = await outcome;
      deps.recordGatewayEvent("info", "gateway_diplomacy_settlement", { commandId, proposerId, targetId, ok: result.ok });
      return result;
    },
    observe: (event) => {
      if (!event.commandId?.startsWith(DIPLOMACY_SETTLEMENT_COMMAND_PREFIX)) return;
      if (event.eventType === "COMMAND_RESOLVED") finish(event.commandId, { ok: true });
      if (event.eventType === "COMMAND_REJECTED") {
        finish(event.commandId, { ok: false, message: event.message ? `The deal fell through: ${event.message}.` : "The deal fell through." });
      }
    },
    pendingCount: () => pending.size
  };
};

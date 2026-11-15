import { MAX_RESOURCE_SUPPLY_AGREEMENTS, ResourceSupplyAgreementSchema, type ResourceSupplyAgreement } from "@border-empires/shared";
import type { RecoveredPlayerState } from "./event-recovery-player-state.js";

type ResourceTradeRecovery = {
  players: RecoveredPlayerState[];
  resourceSupplyAgreements: ResourceSupplyAgreement[];
  resourceSupplyJournalSequence: number;
};

const applyTradeCoin = (
  state: ResourceTradeRecovery, proposerId: string | undefined, targetId: string | undefined, targetCoinDelta: number | undefined
): void => {
  if (typeof targetCoinDelta !== "number" || !Number.isSafeInteger(targetCoinDelta) || targetCoinDelta === 0) return;
  const proposer = state.players.find(player => player.id === proposerId);
  const target = state.players.find(player => player.id === targetId);
  if (typeof proposer?.points !== "number" || typeof target?.points !== "number") return;
  proposer.points -= targetCoinDelta;
  target.points += targetCoinDelta;
};

export const applyRecoveredResourceTrade = (
  state: ResourceTradeRecovery, messageType: "RESOURCE_SUPPLY_CHANGED" | "RESOURCE_SUPPLY_COIN_REFUNDED", payloadJson: string
): void => {
  const payload = JSON.parse(payloadJson) as {
    action?: string;
    agreement?: unknown;
    proposerId?: string;
    targetId?: string;
    targetCoinDelta?: number;
    journalSequence?: number;
  };
  const sequence = payload.journalSequence;
  // The checkpoint may already include this mutation even if its event was
  // persisted after the checkpoint's general event watermark.
  if (sequence !== undefined) {
    if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error("Invalid resource trade journal sequence");
    if (sequence <= state.resourceSupplyJournalSequence) return;
  }

  if (messageType === "RESOURCE_SUPPLY_COIN_REFUNDED") {
    applyTradeCoin(state, payload.proposerId, payload.targetId, payload.targetCoinDelta);
  } else {
    const agreement = ResourceSupplyAgreementSchema.parse(payload.agreement);
    const existing = state.resourceSupplyAgreements.some(row => row.id === agreement.id);
    if (payload.action === "created" && !existing) {
      if (state.resourceSupplyAgreements.length >= MAX_RESOURCE_SUPPLY_AGREEMENTS) {
        throw new RangeError("Resource agreement recovery capacity exceeded");
      }
      state.resourceSupplyAgreements.push(agreement);
      applyTradeCoin(state, agreement.proposerId, agreement.targetId, payload.targetCoinDelta);
    } else if ((payload.action === "cancelled" || payload.action === "expired") && existing) {
      state.resourceSupplyAgreements = state.resourceSupplyAgreements.filter(row => row.id !== agreement.id);
      applyTradeCoin(state, agreement.proposerId, agreement.targetId, payload.targetCoinDelta);
    }
  }
  if (sequence !== undefined) state.resourceSupplyJournalSequence = sequence;
};

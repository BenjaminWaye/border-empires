import { describe, expect, it, vi } from "vitest";

import type { CommandEnvelope } from "@border-empires/sim-protocol";

import { createDiplomacyOfferAcceptance } from "./diplomacy-offer-acceptance.js";
import { createDiplomacySettlement, DIPLOMACY_SETTLEMENT_COMMAND_PREFIX, MAX_PENDING_DIPLOMACY_SETTLEMENTS } from "./diplomacy-settlement.js";
import { createSocialState } from "../social-state/social-state.js";

const terms = { give: { gold: 50, shard: 0 }, ask: { gold: 0, shard: 1 } };

const setupSettlement = (submit: (command: CommandEnvelope) => Promise<unknown> = async () => undefined) => {
  const submitted: CommandEnvelope[] = [];
  const timers: Array<() => void> = [];
  const settlement = createDiplomacySettlement({
    submitCommand: async (command) => {
      submitted.push(command);
      return submit(command);
    },
    isSimulationConnected: () => true,
    now: () => 1_000,
    setTimer: (task) => {
      timers.push(task);
      return { clear: () => undefined };
    },
    recordGatewayEvent: () => undefined
  });
  return { settlement, submitted, timers };
};

describe("createDiplomacySettlement", () => {
  it("submits one settlement command and resolves once the simulation resolves it", async () => {
    const { settlement, submitted } = setupSettlement();
    const result = settlement.settle({ proposerId: "p1", targetId: "p2", terms });
    await Promise.resolve();
    expect(submitted[0]).toEqual(
      expect.objectContaining({
        type: "SETTLE_DIPLOMACY_TERMS",
        playerId: "p2",
        payloadJson: JSON.stringify({ proposerId: "p1", targetId: "p2", proposerPays: terms.give, targetPays: terms.ask })
      })
    );
    settlement.observe({ eventType: "COMMAND_RESOLVED", commandId: submitted[0]!.commandId });
    await expect(result).resolves.toEqual({ ok: true });
    expect(settlement.pendingCount()).toBe(0);
  });

  it("reports the simulation's rejection reason", async () => {
    const { settlement, submitted } = setupSettlement();
    const result = settlement.settle({ proposerId: "p1", targetId: "p2", terms });
    await Promise.resolve();
    settlement.observe({ eventType: "COMMAND_REJECTED", commandId: submitted[0]!.commandId, message: "Beejac no longer has 50 coin" });
    await expect(result).resolves.toEqual({ ok: false, message: "The deal fell through: Beejac no longer has 50 coin." });
  });

  // The verdict can beat the submit ack back to the gateway.
  it("handles a verdict that arrives before the submit ack", async () => {
    let observe: ((commandId: string) => void) | undefined;
    const { settlement } = setupSettlement(async (command) => observe?.(command.commandId));
    observe = (commandId) => settlement.observe({ eventType: "COMMAND_RESOLVED", commandId });
    await expect(settlement.settle({ proposerId: "p1", targetId: "p2", terms })).resolves.toEqual({ ok: true });
  });

  it("fails cleanly on submit errors and timeouts", async () => {
    const failing = setupSettlement(async () => {
      throw new Error("down");
    });
    await expect(failing.settlement.settle({ proposerId: "p1", targetId: "p2", terms })).resolves.toEqual(expect.objectContaining({ ok: false }));

    const { settlement, timers } = setupSettlement();
    const result = settlement.settle({ proposerId: "p1", targetId: "p2", terms });
    await Promise.resolve();
    timers[0]!();
    await expect(result).resolves.toEqual(expect.objectContaining({ ok: false }));
    expect(settlement.pendingCount()).toBe(0);
  });

  it("ignores events that aren't settlements and skips the simulation for empty terms", async () => {
    const { settlement, submitted } = setupSettlement();
    settlement.observe({ eventType: "COMMAND_RESOLVED", commandId: "frontier:1" });
    await expect(settlement.settle({ proposerId: "p1", targetId: "p2", terms: { give: { gold: 0, shard: 0 }, ask: { gold: 0, shard: 0 } } })).resolves.toEqual({ ok: true });
    expect(submitted).toEqual([]);
    expect(DIPLOMACY_SETTLEMENT_COMMAND_PREFIX).toBe("diplomacy-settle:");
  });

  it("caps in-flight settlements", async () => {
    const { settlement } = setupSettlement();
    for (let index = 0; index < MAX_PENDING_DIPLOMACY_SETTLEMENTS; index += 1) void settlement.settle({ proposerId: "p1", targetId: "p2", terms });
    await expect(settlement.settle({ proposerId: "p1", targetId: "p2", terms })).resolves.toEqual(expect.objectContaining({ ok: false }));
  });
});

describe("createDiplomacyOfferAcceptance", () => {
  const players = [
    { id: "p1", name: "Beejac" },
    { id: "p2", name: "Milo" }
  ];
  const offerWithTerms = () => {
    const social = createSocialState({ now: () => 1_000, players });
    social.requestTruce("p1", "Milo", 12, { terms });
    const requestId = social.snapshotForPlayer("p2").incomingTruceRequests[0]!.id;
    return { social, requestId };
  };

  it("pays first, then records the truce", async () => {
    const { social, requestId } = offerWithTerms();
    const settle = vi.fn().mockResolvedValue({ ok: true });
    const acceptance = createDiplomacyOfferAcceptance({ socialState: social, settlement: { settle }, recordGatewayEvent: () => undefined });

    const accepted = await acceptance.acceptTruce("p2", requestId);

    expect(accepted.ok).toBe(true);
    expect(settle).toHaveBeenCalledWith({ proposerId: "p1", targetId: "p2", terms });
    expect(social.snapshotForPlayer("p1").activeTruces).toHaveLength(1);
  });

  it("keeps the offer open when the payment fails", async () => {
    const { social, requestId } = offerWithTerms();
    const settle = vi.fn().mockResolvedValue({ ok: false, message: "The deal fell through: Beejac no longer has 50 coin." });
    const acceptance = createDiplomacyOfferAcceptance({ socialState: social, settlement: { settle }, recordGatewayEvent: () => undefined });

    expect(await acceptance.acceptTruce("p2", requestId)).toEqual({
      ok: false,
      code: "DIPLOMACY_SETTLEMENT_FAILED",
      message: "The deal fell through: Beejac no longer has 50 coin."
    });
    expect(social.snapshotForPlayer("p1").activeTruces).toEqual([]);
    expect(social.snapshotForPlayer("p2").incomingTruceRequests).toHaveLength(1);
    // The lock is released: the target can still reject it.
    expect(social.rejectTruce("p2", requestId).ok).toBe(true);
  });

  // The settlement lock stops a cancel landing mid-payment, so the payment
  // can never go through without the truce it paid for.
  it("blocks cancel and reject while the payment is in flight", async () => {
    const { social, requestId } = offerWithTerms();
    let finishPayment: (value: { ok: true }) => void = () => undefined;
    const settle = vi.fn().mockReturnValue(new Promise((resolve) => { finishPayment = resolve; }));
    const acceptance = createDiplomacyOfferAcceptance({ socialState: social, settlement: { settle }, recordGatewayEvent: () => undefined });

    const accepting = acceptance.acceptTruce("p2", requestId);
    const outgoingId = social.snapshotForPlayer("p1").outgoingTruceRequests[0]!.id;
    expect(social.cancelTruce("p1", outgoingId)).toEqual(expect.objectContaining({ ok: false, code: "OFFER_SETTLING" }));
    expect(social.rejectTruce("p2", requestId)).toEqual(expect.objectContaining({ ok: false, code: "OFFER_SETTLING" }));
    finishPayment({ ok: true });
    expect((await accepting).ok).toBe(true);
  });

  it("refunds the payment if the truce can't be recorded after all", async () => {
    const { social, requestId } = offerWithTerms();
    const settle = vi.fn().mockResolvedValue({ ok: true });
    const recordGatewayEvent = vi.fn();
    const acceptance = createDiplomacyOfferAcceptance({
      socialState: { ...social, acceptTruce: () => ({ ok: false, code: "TRUCE_LOCKED_OUT", message: "locked out" }) },
      settlement: { settle },
      recordGatewayEvent
    });

    expect(await acceptance.acceptTruce("p2", requestId)).toEqual(expect.objectContaining({ ok: false, code: "TRUCE_LOCKED_OUT" }));
    expect(settle).toHaveBeenLastCalledWith({ proposerId: "p1", targetId: "p2", terms: { give: terms.ask, ask: terms.give } });
    expect(recordGatewayEvent).toHaveBeenCalledWith("warn", "gateway_diplomacy_settlement_refunded", expect.objectContaining({ refunded: true }));
  });

  it("accepts offers without terms without touching the simulation", async () => {
    const social = createSocialState({ now: () => 1_000, players });
    social.requestAlliance("p1", "Milo");
    const requestId = social.snapshotForPlayer("p2").incomingAllianceRequests[0]!.id;
    const settle = vi.fn();
    const acceptance = createDiplomacyOfferAcceptance({ socialState: social, settlement: { settle }, recordGatewayEvent: () => undefined });

    expect((await acceptance.acceptAlliance("p2", requestId)).ok).toBe(true);
    expect(settle).not.toHaveBeenCalled();
  });
});

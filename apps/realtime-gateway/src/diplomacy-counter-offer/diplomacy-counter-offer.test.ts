import { describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "@border-empires/shared";

import { createSocialState, type SocialStateSink } from "../social-state/social-state.js";
import { rejectCounteredOffer } from "./diplomacy-counter-offer.js";

const players = [
  { id: "player-1", name: "Tove" },
  { id: "player-2", name: "Valka" }
];

const setup = () => {
  const sink = new Proxy({} as SocialStateSink, { get: () => () => undefined });
  const social = createSocialState({ now: () => 1_000, players, sink });
  const fanoutPlayerPayloads = vi.fn();
  const counterDeps = { rejectTruce: social.rejectTruce, rejectAlliance: social.rejectAlliance, fanoutPlayerPayloads };
  return { social, counterDeps, fanoutPlayerPayloads };
};

describe("rejectCounteredOffer", () => {
  it("replaces an incoming truce offer with the counter's terms, without a re-offer cooldown", () => {
    const { social, counterDeps, fanoutPlayerPayloads } = setup();
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    const offerId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]!.id;
    const terms = { give: { gold: 0 }, ask: { gold: 24 } };
    const counter: ClientMessage = { type: "TRUCE_REQUEST", targetPlayerName: "Tove", durationHours: 12, terms, counters: { kind: "truce", requestId: offerId } };

    // Without the counter step the new offer is blocked by the pending one.
    expect(social.requestTruce("player-2", "Tove", 12, { terms })).toMatchObject({ ok: false, code: "TRUCE_REQUEST_PENDING" });

    rejectCounteredOffer(counterDeps, counter, "player-2");
    expect(fanoutPlayerPayloads).toHaveBeenCalledTimes(1);
    expect(social.requestTruce("player-2", "Tove", 12, { terms }).ok).toBe(true);

    expect(social.snapshotForPlayer("player-1").incomingTruceRequests).toEqual([expect.objectContaining({ fromPlayerId: "player-2", terms })]);
    expect(social.snapshotForPlayer("player-2").incomingTruceRequests).toEqual([]);
    expect(social.snapshotForPlayer("player-1").offerCooldowns).toEqual([]);
  });

  it("can counter an alliance offer with a truce", () => {
    const { social, counterDeps } = setup();
    expect(social.requestAlliance("player-1", "Valka").ok).toBe(true);
    const offerId = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]!.id;
    const counter: ClientMessage = { type: "TRUCE_REQUEST", targetPlayerName: "Tove", durationHours: 24, counters: { kind: "alliance", requestId: offerId } };

    rejectCounteredOffer(counterDeps, counter, "player-2");

    expect(social.snapshotForPlayer("player-2").incomingAllianceRequests).toEqual([]);
  });

  it("lets you answer a counter to your refused offer despite your own re-offer cooldown (playtest run 5)", () => {
    const { social, counterDeps } = setup();
    // Tove offers, Valka refuses (Tove's 30m cooldown starts) and counters with her own offer.
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    const firstId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]!.id;
    expect(social.rejectTruce("player-2", firstId).ok).toBe(true);
    expect(social.requestTruce("player-2", "Tove", 12).ok).toBe(true);
    const counterId = social.snapshotForPlayer("player-1").incomingTruceRequests[0]!.id;
    const reply: ClientMessage = { type: "TRUCE_REQUEST", targetPlayerName: "Valka", durationHours: 24, counters: { kind: "truce", requestId: counterId } };

    rejectCounteredOffer(counterDeps, reply, "player-1");

    expect(social.requestTruce("player-1", "Valka", 24).ok).toBe(true);
    expect(social.snapshotForPlayer("player-2").incomingTruceRequests).toEqual([expect.objectContaining({ fromPlayerId: "player-1", durationHours: 24 })]);
  });

  it("keeps the cooldown for a fresh offer that answers nothing", () => {
    const { social } = setup();
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    const firstId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]!.id;
    expect(social.rejectTruce("player-2", firstId).ok).toBe(true);
    expect(social.requestTruce("player-1", "Valka", 12)).toMatchObject({ ok: false, code: "TRUCE_OFFER_COOLDOWN" });
  });

  it("keeps the offer when the counter's note is refused, since the counter is never sent", () => {
    const { social, counterDeps, fanoutPlayerPayloads } = setup();
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    const offerId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]!.id;
    const counter: ClientMessage = { type: "TRUCE_REQUEST", targetPlayerName: "Tove", durationHours: 24, note: "you sh1t", counters: { kind: "truce", requestId: offerId } };

    rejectCounteredOffer(counterDeps, counter, "player-2");

    expect(fanoutPlayerPayloads).not.toHaveBeenCalled();
    expect(social.snapshotForPlayer("player-2").incomingTruceRequests).toEqual([expect.objectContaining({ id: offerId })]);
  });

  it("ignores requests that aren't counters and counters to offers that are already gone", () => {
    const { counterDeps, fanoutPlayerPayloads } = setup();
    rejectCounteredOffer(counterDeps, { type: "TRUCE_REQUEST", targetPlayerName: "Tove", durationHours: 12 }, "player-2");
    rejectCounteredOffer(counterDeps, { type: "ALLIANCE_REQUEST", targetPlayerName: "Tove", counters: { kind: "alliance", requestId: "gone" } }, "player-2");
    expect(fanoutPlayerPayloads).not.toHaveBeenCalled();
  });
});

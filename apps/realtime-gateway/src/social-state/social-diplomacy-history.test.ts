import { describe, expect, it } from "vitest";

import { createDiplomacyHistory, DIPLOMACY_HISTORY_PER_PLAYER_CAP, DIPLOMACY_HISTORY_TTL_MS, diplomacyHistoryDiagnostics } from "./social-diplomacy-history.js";
import { createSocialState } from "./social-state.js";

const tove = { id: "player-2", name: "Tove" };
const me = { id: "player-1", name: "Nauticus" };

describe("diplomacy history", () => {
  it("records one event for both sides, each seeing the other", () => {
    const history = createDiplomacyHistory(() => 10_000, { nameOf: (id) => [me, tove].find((player) => player.id === id)?.name });
    history.recordPair(me.id, tove.id, "TRUCE_STARTED", 5_000, { durationHours: 12 });
    expect(history.cardsFor(me.id, 0, 10_000)).toEqual([expect.objectContaining({ kind: "DIPLOMACY", event: "TRUCE_STARTED", counterpartyPlayerId: tove.id, counterpartyName: "Tove", durationHours: 12 })]);
    expect(history.cardsFor(tove.id, 0, 10_000)).toEqual([expect.objectContaining({ counterpartyPlayerId: me.id, counterpartyName: "Nauticus" })]);
  });

  it("caps each player's rows and drops rows older than the timeline window", () => {
    const clock = { now: DIPLOMACY_HISTORY_TTL_MS * 2 };
    const history = createDiplomacyHistory(() => clock.now);
    const evictionsBefore = diplomacyHistoryDiagnostics.evictions;
    for (let index = 0; index < DIPLOMACY_HISTORY_PER_PLAYER_CAP + 5; index += 1) history.recordPair(me.id, tove.id, "TRUCE_ENDED", clock.now - index);
    expect(history.cardsFor(me.id, 0, clock.now)).toHaveLength(DIPLOMACY_HISTORY_PER_PLAYER_CAP);
    expect(diplomacyHistoryDiagnostics.evictions - evictionsBefore).toBe(10);

    clock.now += DIPLOMACY_HISTORY_TTL_MS + 1_000;
    expect(history.cardsFor(me.id, 0, clock.now)).toEqual([]);
  });
});

describe("social state diplomacy cards", () => {
  const setup = () => {
    const clock = { now: 1_000 };
    const social = createSocialState({ now: () => clock.now, players: [me, tove] });
    return { social, clock };
  };

  // The truce in the screenshot: it ran out, and the only sign was a popup.
  it("records a truce that runs out on both sides and pushes them a truce update", () => {
    const { social, clock } = setup();
    expect(social.requestTruce(me.id, "Tove", 12).ok).toBe(true);
    const requestId = social.snapshotForPlayer(tove.id).incomingTruceRequests[0]!.id;
    expect(social.acceptTruce(tove.id, requestId).ok).toBe(true);
    const endsAt = social.snapshotForPlayer(me.id).activeTruces[0]!.endsAt;
    clock.now = endsAt + 30_000;

    const sync = social.takeStaleOfferSync();
    expect(sync?.notifyPlayerIds.sort()).toEqual([me.id, tove.id]);
    const update = sync?.payloadsByPlayerId.get(me.id)?.find((payload) => (payload as { type?: string }).type === "TRUCE_UPDATE");
    expect(update).toEqual(expect.objectContaining({ activeTruces: [], serverNow: expect.any(Number) }));
    expect(update).not.toHaveProperty("announcement");

    const cards = social.diplomacyActivityCards(me.id, 0, clock.now);
    expect(cards.map((card) => card.event)).toEqual(["TRUCE_ENDED", "TRUCE_STARTED"]);
    // Dated at the truce's own end, so it reads right for a player who was offline.
    expect(cards[0]).toEqual(expect.objectContaining({ occurredAt: endsAt, counterpartyName: "Tove" }));
    expect(social.diplomacyActivityCards(tove.id, 0, clock.now)[0]).toEqual(expect.objectContaining({ event: "TRUCE_ENDED", counterpartyPlayerId: me.id }));
  });

  it("records who broke a truce, and alliances forming and fully breaking", () => {
    const { social, clock } = setup();
    expect(social.requestTruce(me.id, "Tove", 12).ok).toBe(true);
    expect(social.acceptTruce(tove.id, social.snapshotForPlayer(tove.id).incomingTruceRequests[0]!.id).ok).toBe(true);
    clock.now += 1_000;
    expect(social.breakTruce(tove.id, me.id).ok).toBe(true);
    expect(social.diplomacyActivityCards(me.id, 0, clock.now)[0]).toEqual(expect.objectContaining({ event: "TRUCE_BROKEN", byPlayerId: tove.id }));

    clock.now += 1_000;
    expect(social.requestAlliance(me.id, "Tove").ok).toBe(true);
    expect(social.acceptAlliance(tove.id, social.snapshotForPlayer(tove.id).incomingAllianceRequests[0]!.id).ok).toBe(true);
    expect(social.diplomacyActivityCards(tove.id, 0, clock.now).map((card) => card.event)).toEqual(["ALLIANCE_FORMED", "TRUCE_BROKEN", "TRUCE_STARTED"]);

    // The 24h break notice runs out; by then the rows above have aged out of the window.
    clock.now += 1_000;
    expect(social.breakAlliance(me.id, tove.id).ok).toBe(true);
    clock.now += 24 * 60 * 60_000;
    social.finalizeExpiredAllianceBreaks();
    expect(social.diplomacyActivityCards(tove.id, clock.now - 24 * 60 * 60_000, clock.now)).toEqual([
      expect.objectContaining({ event: "ALLIANCE_BROKEN", counterpartyPlayerId: me.id, counterpartyName: "Nauticus", occurredAt: clock.now })
    ]);
  });

  it("only returns rows inside the requested window", () => {
    const { social, clock } = setup();
    expect(social.requestAlliance(me.id, "Tove").ok).toBe(true);
    expect(social.acceptAlliance(tove.id, social.snapshotForPlayer(tove.id).incomingAllianceRequests[0]!.id).ok).toBe(true);
    clock.now += 10_000;
    expect(social.diplomacyActivityCards(me.id, 5_000, clock.now)).toEqual([]);
  });

  it("does not invent a player record for a truce member it does not know", () => {
    const clock = { now: 10_000 };
    const social = createSocialState({
      now: () => clock.now,
      players: [me],
      initial: { activeTruces: [{ playerAId: me.id, playerBId: "ghost", startedAt: 0, endsAt: 5_000, createdByPlayerId: me.id }] }
    });
    expect(social.diplomacyActivityCards(me.id, 0, clock.now)).toEqual([expect.objectContaining({ event: "TRUCE_ENDED", counterpartyPlayerId: "ghost", counterpartyName: "ghost" })]);
    expect(social.resolvePlayerById("ghost")).toBeUndefined();
  });

  it("adds no row when a running truce is extended, and one ending when the extended truce runs out", () => {
    const { social, clock } = setup();
    expect(social.requestTruce(me.id, "Tove", 12).ok).toBe(true);
    expect(social.acceptTruce(tove.id, social.snapshotForPlayer(tove.id).incomingTruceRequests[0]!.id).ok).toBe(true);
    clock.now += 60_000;
    expect(social.requestTruce(tove.id, "Nauticus", 12).ok).toBe(true);
    const extension = social.snapshotForPlayer(me.id).incomingTruceRequests[0]!;
    expect(extension).toMatchObject({ extendsTruce: true });
    expect(social.acceptTruce(me.id, extension.id).ok).toBe(true);
    expect(social.diplomacyActivityCards(me.id, 0, clock.now).map((card) => card.event)).toEqual(["TRUCE_STARTED"]);

    // The extended truce outlasts the 24h window, so by its end only the ending is left to show.
    const endsAt = social.snapshotForPlayer(me.id).activeTruces[0]!.endsAt;
    clock.now = endsAt + 1;
    expect(social.diplomacyActivityCards(me.id, 0, clock.now)).toEqual([expect.objectContaining({ event: "TRUCE_ENDED", occurredAt: endsAt })]);
  });
});


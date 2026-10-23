import { describe, expect, it } from "vitest";

import { createSocialState } from "./social-state.js";

const players = [
  { id: "player-1", name: "Nauticus" },
  { id: "player-2", name: "Valka" },
  { id: "player-3", name: "Orrin" }
];

const setup = () => {
  const clock = { now: 1_000 };
  const social = createSocialState({ now: () => clock.now, players });
  return { social, clock };
};

const truceUpdateFor = (payloads: Map<string, unknown[]> | undefined, playerId: string): unknown =>
  payloads?.get(playerId)?.find((payload) => (payload as { type?: string }).type === "TRUCE_UPDATE");

describe("takeStaleOfferSync", () => {
  it("is empty while no offer was dropped", () => {
    const { social } = setup();
    expect(social.takeStaleOfferSync()).toBeUndefined();
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    expect(social.takeStaleOfferSync()).toBeUndefined();
  });

  it("tells both sides once an unanswered truce offer expires, with the expiry cooldown", () => {
    const { social, clock } = setup();
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    clock.now = social.snapshotForPlayer("player-1").outgoingTruceRequests[0]!.expiresAt;

    const sync = social.takeStaleOfferSync();
    expect(sync?.notifyPlayerIds.sort()).toEqual(["player-1", "player-2"]);
    expect(truceUpdateFor(sync?.payloadsByPlayerId, "player-2")).toEqual(expect.objectContaining({ incomingTruceRequests: [] }));
    expect(truceUpdateFor(sync?.payloadsByPlayerId, "player-1")).toEqual(
      expect.objectContaining({ outgoingTruceRequests: [], offerCooldowns: [expect.objectContaining({ targetPlayerId: "player-2" })] })
    );
    // Flushed: the next run has nothing to send.
    expect(social.takeStaleOfferSync()).toBeUndefined();
  });

  it("queues the sender when a failed accept deletes their offer", () => {
    const { social } = setup();
    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    expect(social.requestTruce("player-3", "Valka", 12).ok).toBe(true);
    const fromOrrin = social.snapshotForPlayer("player-2").incomingTruceRequests.find((request) => request.fromPlayerId === "player-3")!;
    const fromNauticus = social.snapshotForPlayer("player-2").incomingTruceRequests.find((request) => request.fromPlayerId === "player-1")!;
    expect(social.acceptTruce("player-2", fromNauticus.id).ok).toBe(true);
    expect(social.breakTruce("player-2", "player-1").ok).toBe(true);

    // Valka is now locked out, so accepting Orrin's offer fails and deletes it.
    expect(social.acceptTruce("player-2", fromOrrin.id)).toEqual(expect.objectContaining({ ok: false, code: "TRUCE_LOCKED_OUT" }));
    const sync = social.takeStaleOfferSync();
    expect(sync?.notifyPlayerIds).toEqual(["player-3"]);
    expect(truceUpdateFor(sync?.payloadsByPlayerId, "player-3")).toEqual(expect.objectContaining({ outgoingTruceRequests: [] }));
  });
});

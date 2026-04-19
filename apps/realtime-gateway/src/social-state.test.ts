import { describe, expect, it } from "vitest";

import { createSocialState } from "./social-state.js";

describe("social state", () => {
  it("tracks alliance and truce lifecycle snapshots for both players", () => {
    const social = createSocialState({
      now: () => 1_000,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" }
      ]
    });

    const allianceRequest = social.requestAlliance("player-1", "Valka");
    expect(allianceRequest.ok).toBe(true);
    expect(social.snapshotForPlayer("player-2").incomingAllianceRequests).toEqual([
      expect.objectContaining({ fromPlayerId: "player-1", toPlayerId: "player-2" })
    ]);

    const requestId = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]?.id;
    expect(requestId).toBeTruthy();
    const accepted = social.acceptAlliance("player-2", requestId!);
    expect(accepted.ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").allies).toEqual(["player-2"]);
    expect(social.snapshotForPlayer("player-2").allies).toEqual(["player-1"]);

    const truceRequest = social.requestTruce("player-1", "Valka", 12);
    expect(truceRequest.ok).toBe(true);
    const truceRequestId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]?.id;
    expect(truceRequestId).toBeTruthy();
    const truceAccepted = social.acceptTruce("player-2", truceRequestId!);
    expect(truceAccepted.ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").activeTruces).toEqual([
      expect.objectContaining({ otherPlayerId: "player-2", otherPlayerName: "Valka" })
    ]);
  });

  it("supports rejecting, cancelling, and breaking alliance requests", () => {
    const social = createSocialState({
      now: () => 1_000,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" }
      ]
    });

    const firstRequest = social.requestAlliance("player-1", "Valka");
    expect(firstRequest.ok).toBe(true);
    const firstRequestId = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]?.id;
    expect(firstRequestId).toBeTruthy();
    expect(social.rejectAlliance("player-2", firstRequestId!).ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").outgoingAllianceRequests).toHaveLength(0);
    expect(social.snapshotForPlayer("player-2").incomingAllianceRequests).toHaveLength(0);

    const secondRequest = social.requestAlliance("player-1", "Valka");
    expect(secondRequest.ok).toBe(true);
    const secondRequestId = social.snapshotForPlayer("player-1").outgoingAllianceRequests[0]?.id;
    expect(secondRequestId).toBeTruthy();
    expect(social.cancelAlliance("player-1", secondRequestId!).ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").outgoingAllianceRequests).toHaveLength(0);

    const acceptedRequest = social.requestAlliance("player-1", "Valka");
    expect(acceptedRequest.ok).toBe(true);
    const acceptedRequestId = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]?.id;
    expect(acceptedRequestId).toBeTruthy();
    expect(social.acceptAlliance("player-2", acceptedRequestId!).ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").allies).toEqual(["player-2"]);
    expect(social.breakAlliance("player-1", "player-2").ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").allies).toEqual([]);
    expect(social.snapshotForPlayer("player-2").allies).toEqual([]);
  });

  it("expires truce requests and supports cancelling and breaking active truces", () => {
    let currentTime = 1_000;
    const social = createSocialState({
      now: () => currentTime,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" },
        { id: "player-3", name: "Beejac" }
      ]
    });

    const firstRequest = social.requestTruce("player-1", "Valka", 12);
    expect(firstRequest.ok).toBe(true);
    const firstRequestId = social.snapshotForPlayer("player-1").outgoingTruceRequests[0]?.id;
    expect(firstRequestId).toBeTruthy();
    expect(social.cancelTruce("player-1", firstRequestId!).ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").outgoingTruceRequests).toHaveLength(0);

    const expiringRequest = social.requestTruce("player-1", "Beejac", 12);
    expect(expiringRequest.ok).toBe(true);
    currentTime += 5 * 60_000 + 1;
    const expiredRequestId = social.snapshotForPlayer("player-3").incomingTruceRequests[0]?.id;
    expect(expiredRequestId).toBeUndefined();
    expect(social.acceptTruce("player-3", "missing-request").ok).toBe(false);

    currentTime = 10_000;
    const acceptedRequest = social.requestTruce("player-1", "Valka", 24);
    expect(acceptedRequest.ok).toBe(true);
    const acceptedRequestId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]?.id;
    expect(acceptedRequestId).toBeTruthy();
    expect(social.acceptTruce("player-2", acceptedRequestId!).ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").activeTruces).toEqual([
      expect.objectContaining({ otherPlayerId: "player-2" })
    ]);
    expect(social.breakTruce("player-1", "player-2").ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").activeTruces).toHaveLength(0);
    expect(social.snapshotForPlayer("player-2").activeTruces).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";

import { createSocialState, MAX_TRUCE_BREAKS_PER_PLAYER } from "./social-state.js";

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
    let nowMs = 1_000;
    const social = createSocialState({
      now: () => nowMs,
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
    const breakNotice = social.breakAlliance("player-1", "player-2");
    expect(breakNotice.ok).toBe(true);
    expect(breakNotice.ok ? breakNotice.payloadsByPlayerId.get("player-2") : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ALLIANCE_UPDATE",
          announcement: "Nauticus started a 24h notice to break your alliance."
        }),
        expect.objectContaining({
          type: "ALLIANCE_BREAK_INCOMING",
          fromName: "Nauticus",
          fromPlayerId: "player-1",
          toPlayerId: "player-2"
        })
      ])
    );
    expect(social.snapshotForPlayer("player-1").allies).toEqual(["player-2"]);
    expect(social.snapshotForPlayer("player-1").activeAllianceBreaks).toEqual([
      expect.objectContaining({ otherPlayerId: "player-2", createdByPlayerId: "player-1" })
    ]);
    expect(social.breakAlliance("player-1", "player-2")).toEqual({
      ok: false,
      code: "ALLIANCE_BREAK_INVALID",
      message: "alliance break notice already active"
    });
    nowMs += 24 * 60 * 60_000 + 1;
    expect(social.expiredAllianceBreaks()).toEqual([
      expect.objectContaining({ playerAId: "player-1", playerBId: "player-2", playerIds: ["player-1", "player-2"] })
    ]);
    expect(social.snapshotForPlayer("player-1").allies).toEqual(["player-2"]);
    expect(social.snapshotForPlayer("player-1").activeAllianceBreaks).toEqual([
      expect.objectContaining({ otherPlayerId: "player-2", createdByPlayerId: "player-1" })
    ]);
    const finalized = social.finalizeExpiredAllianceBreaks();
    expect(finalized.expiredBreaks).toHaveLength(1);
    expect(finalized.payloadsByPlayerId.get("player-2")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "ALLIANCE_UPDATE",
          recentAllianceBreaks: [
            expect.objectContaining({
              otherPlayerId: "player-1",
              finalizedAt: nowMs
            })
          ],
          announcement: "Your alliance with Nauticus is now broken."
        })
      ])
    );
    expect(social.snapshotForPlayer("player-1").allies).toEqual([]);
    expect(social.snapshotForPlayer("player-2").allies).toEqual([]);
    expect(social.snapshotForPlayer("player-1").recentAllianceBreaks).toEqual([
      expect.objectContaining({ otherPlayerId: "player-2", finalizedAt: nowMs })
    ]);

    const renewedRequest = social.requestAlliance("player-2", "Nauticus");
    expect(renewedRequest.ok).toBe(true);
    const renewedRequestId = social.snapshotForPlayer("player-1").incomingAllianceRequests[0]?.id;
    expect(renewedRequestId).toBeTruthy();
    expect(social.acceptAlliance("player-1", renewedRequestId!).ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").allies).toEqual(["player-2"]);
    expect(social.snapshotForPlayer("player-1").recentAllianceBreaks).toEqual([]);
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
    expect(social.activeTrucePairs()).toEqual([["player-1", "player-2"]]);
    expect(social.breakTruce("player-1", "player-2").ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").activeTruces).toHaveLength(0);
    expect(social.snapshotForPlayer("player-2").activeTruces).toHaveLength(0);
    expect(social.activeTrucePairs()).toEqual([]);
  });

  it("activeTrucePairs sweeps out truces whose duration has elapsed", () => {
    let currentTime = 1_000;
    const social = createSocialState({
      now: () => currentTime,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" }
      ]
    });
    social.requestTruce("player-1", "Valka", 12);
    const requestId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]?.id;
    expect(social.acceptTruce("player-2", requestId!).ok).toBe(true);
    expect(social.activeTrucePairs()).toEqual([["player-1", "player-2"]]);

    currentTime += 12 * 60 * 60_000 + 1;
    expect(social.activeTrucePairs()).toEqual([]);
  });

  it("allows a player to hold multiple concurrent truces with different opponents", () => {
    const social = createSocialState({
      now: () => 1_000,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" },
        { id: "player-3", name: "Beejac" }
      ]
    });

    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    expect(social.requestTruce("player-3", "Nauticus", 12).ok).toBe(true);
    const valkaRequestId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]?.id;
    const beejacRequestId = social.snapshotForPlayer("player-1").incomingTruceRequests[0]?.id;
    expect(valkaRequestId).toBeTruthy();
    expect(beejacRequestId).toBeTruthy();

    // player-1 ends up truced with both player-2 and player-3 at once.
    expect(social.acceptTruce("player-1", beejacRequestId!).ok).toBe(true);
    expect(social.acceptTruce("player-2", valkaRequestId!).ok).toBe(true);

    const sync = social.syncPlayers(["player-1", "player-2"]);
    expect(sync.ok).toBe(true);
    expect(sync.payloadsByPlayerId.get("player-1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "TRUCE_UPDATE",
          outgoingTruceRequests: [],
          activeTruces: expect.arrayContaining([
            expect.objectContaining({ otherPlayerId: "player-2" }),
            expect.objectContaining({ otherPlayerId: "player-3" })
          ])
        })
      ])
    );
    expect(sync.payloadsByPlayerId.get("player-2")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "TRUCE_UPDATE",
          incomingTruceRequests: [],
          activeTruces: [expect.objectContaining({ otherPlayerId: "player-1" })]
        })
      ])
    );
  });

  it("rejects a truce request between players who already have an active truce, but allows truces with others", () => {
    const social = createSocialState({
      now: () => 1_000,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" },
        { id: "player-3", name: "Beejac" }
      ]
    });

    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    const requestId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]?.id;
    expect(social.acceptTruce("player-2", requestId!).ok).toBe(true);

    expect(social.requestTruce("player-1", "Valka", 12)).toEqual({
      ok: false,
      code: "TRUCE_EXISTS",
      message: "you already have an active truce with that player"
    });

    // player-1 is still free to truce with a different player.
    expect(social.requestTruce("player-1", "Beejac", 12).ok).toBe(true);
  });

  it("allows a player to have multiple pending outgoing truce offers to different players at once", () => {
    const social = createSocialState({
      now: () => 1_000,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" },
        { id: "player-3", name: "Beejac" }
      ]
    });

    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    expect(social.requestTruce("player-1", "Beejac", 24).ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").outgoingTruceRequests).toHaveLength(2);

    const valkaRequestId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]?.id;
    const beejacRequestId = social.snapshotForPlayer("player-3").incomingTruceRequests[0]?.id;
    expect(social.acceptTruce("player-2", valkaRequestId!).ok).toBe(true);
    expect(social.acceptTruce("player-3", beejacRequestId!).ok).toBe(true);
    expect(social.activeTrucePairs()).toEqual(
      expect.arrayContaining([
        ["player-1", "player-2"],
        ["player-1", "player-3"]
      ])
    );
  });

  it("rejects duplicate pending truce requests between the same players", () => {
    const social = createSocialState({
      now: () => 1_000,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" }
      ]
    });

    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    expect(social.requestTruce("player-1", "Valka", 24)).toEqual({
      ok: false,
      code: "TRUCE_REQUEST_PENDING",
      message: "a truce offer is already pending"
    });
    expect(social.requestTruce("player-2", "Nauticus", 12)).toEqual({
      ok: false,
      code: "TRUCE_REQUEST_PENDING",
      message: "a truce offer is already pending"
    });
    expect(social.snapshotForPlayer("player-1").outgoingTruceRequests).toHaveLength(1);
    expect(social.snapshotForPlayer("player-2").incomingTruceRequests).toHaveLength(1);
  });

  it("locks the breaker out of new truces for 24h after breaking one early, but not the target", () => {
    let currentTime = 1_000;
    const social = createSocialState({
      now: () => currentTime,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" },
        { id: "player-3", name: "Beejac" },
        { id: "player-4", name: "Draymoor" }
      ]
    });

    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    const requestId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]?.id;
    expect(social.acceptTruce("player-2", requestId!).ok).toBe(true);

    const breakResult = social.breakTruce("player-1", "player-2");
    expect(breakResult.ok).toBe(true);
    expect(breakResult.ok && breakResult.payloadsByPlayerId.get("player-1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "TRUCE_UPDATE",
          announcement: "Nauticus broke the truce with Valka early and is locked out of new truces for 24h."
        })
      ])
    );

    // Breaker is locked out of requesting a new truce with anyone.
    expect(social.requestTruce("player-1", "Beejac", 12)).toEqual({
      ok: false,
      code: "TRUCE_LOCKED_OUT",
      message: "you broke a truce recently and cannot request a new truce yet"
    });

    // Breaker is also locked out of accepting an incoming truce offer.
    expect(social.requestTruce("player-3", "Nauticus", 12).ok).toBe(true);
    const incomingId = social.snapshotForPlayer("player-1").incomingTruceRequests[0]?.id;
    expect(social.acceptTruce("player-1", incomingId!)).toEqual({
      ok: false,
      code: "TRUCE_LOCKED_OUT",
      message: "one player broke a truce recently and is locked out"
    });

    // The target of the break is not penalized and can truce freely.
    expect(social.requestTruce("player-2", "Beejac", 12).ok).toBe(true);

    // After 24h the lockout expires.
    currentTime += 24 * 60 * 60_000 + 1;
    expect(social.requestTruce("player-1", "Draymoor", 12).ok).toBe(true);
  });

  it("keeps a broken-truce record on the breaker's snapshot for the rest of the season, past the 24h lockout window", () => {
    let currentTime = 1_000;
    const social = createSocialState({
      now: () => currentTime,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" }
      ]
    });

    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    const requestId = social.snapshotForPlayer("player-2").incomingTruceRequests[0]?.id;
    expect(social.acceptTruce("player-2", requestId!).ok).toBe(true);
    expect(social.breakTruce("player-1", "player-2").ok).toBe(true);

    expect(social.snapshotForPlayer("player-1").truceBreaksThisSeason).toEqual([
      { targetPlayerId: "player-2", targetPlayerName: "Valka", brokenAt: 1_000 }
    ]);
    // The target's own list is unaffected -- only the breaker is marked.
    expect(social.snapshotForPlayer("player-2").truceBreaksThisSeason).toEqual([]);

    // Past the 24h lockout window, the badge-backing record is still there.
    currentTime += 24 * 60 * 60_000 + 1;
    expect(social.snapshotForPlayer("player-1").truceBreaksThisSeason).toEqual([
      { targetPlayerId: "player-2", targetPlayerName: "Valka", brokenAt: 1_000 }
    ]);
  });

  it("caps truceBreaksThisSeason at MAX_TRUCE_BREAKS_PER_PLAYER, keeping the most recent breaks", () => {
    let currentTime = 0;
    const targetCount = MAX_TRUCE_BREAKS_PER_PLAYER + 5;
    const players = [
      { id: "player-1", name: "Nauticus" },
      ...Array.from({ length: targetCount }, (_, i) => ({ id: `target-${i}`, name: `Target${i}` }))
    ];
    const social = createSocialState({ now: () => currentTime, players });

    for (let i = 0; i < targetCount; i += 1) {
      // Sidestep the 24h new-truce lockout by using a fresh target each time.
      currentTime = i * 25 * 60 * 60_000;
      expect(social.requestTruce("player-1", `Target${i}`, 12).ok).toBe(true);
      const requestId = social.snapshotForPlayer(`target-${i}`).incomingTruceRequests[0]?.id;
      expect(social.acceptTruce(`target-${i}`, requestId!).ok).toBe(true);
      expect(social.breakTruce("player-1", `target-${i}`).ok).toBe(true);
    }

    const breaks = social.snapshotForPlayer("player-1").truceBreaksThisSeason;
    expect(breaks).toHaveLength(MAX_TRUCE_BREAKS_PER_PLAYER);
    // Oldest breaks (target-0..target-4) were dropped; the most recent survive.
    expect(breaks[0]!.targetPlayerName).toBe("Target5");
    expect(breaks.at(-1)!.targetPlayerName).toBe(`Target${targetCount - 1}`);
  });

  it("rejects a truce request targeting a barbarian player id, even if somehow registered", () => {
    const social = createSocialState({
      now: () => 1_000,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "barbarian-1", name: "Barbarians" }
      ]
    });

    expect(social.requestTruce("player-1", "Barbarians", 12)).toEqual({
      ok: false,
      code: "TRUCE_TARGET",
      message: "target not found"
    });
  });

  it("allows additional outgoing truce requests to other players while one is already pending", () => {
    const social = createSocialState({
      now: () => 1_000,
      players: [
        { id: "player-1", name: "Nauticus" },
        { id: "player-2", name: "Valka" },
        { id: "player-3", name: "Beejac" }
      ]
    });

    expect(social.requestTruce("player-1", "Valka", 12).ok).toBe(true);
    expect(social.requestTruce("player-1", "Beejac", 12).ok).toBe(true);
    expect(social.snapshotForPlayer("player-1").outgoingTruceRequests).toEqual([
      expect.objectContaining({ toPlayerId: "player-2" }),
      expect.objectContaining({ toPlayerId: "player-3" })
    ]);
    expect(social.snapshotForPlayer("player-3").incomingTruceRequests).toHaveLength(1);
  });
});

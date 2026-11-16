import { describe, expect, it } from "vitest";

import { createSocialState } from "./social-state.js";

// Playtest 2026-11-16 (Lena, day 3): Gerald accepted her alliance offer and
// nothing told her; a human's accept carried no announcement for the proposer.
const announcementsFor = (payloads: Map<string, unknown[]>, playerId: string): unknown[] =>
  (payloads.get(playerId) ?? []).map((payload) => (payload as { announcement?: string }).announcement).filter(Boolean);

describe("accepted alliance announcements", () => {
  const setup = () =>
    createSocialState({
      now: () => 1_000,
      players: [
        { id: "player-1", name: "Lena" },
        { id: "player-2", name: "Gerald" }
      ]
    });

  it("tells the proposer when a human accepts their alliance offer", () => {
    const social = setup();
    social.requestAlliance("player-1", "Gerald");
    const id = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]!.id;
    const result = social.acceptAlliance("player-2", id);
    if (!result.ok) throw new Error(result.message);
    expect(announcementsFor(result.payloadsByPlayerId, "player-1")).toEqual(["Gerald accepted your alliance offer."]);
    expect(announcementsFor(result.payloadsByPlayerId, "player-2")).toEqual(["You accepted Lena's alliance offer."]);
  });

  it("keeps an AI's own wording when it gives one", () => {
    const social = setup();
    social.requestAlliance("player-1", "Gerald");
    const id = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]!.id;
    const result = social.acceptAlliance("player-2", id, { "player-1": "Gerald accepted your alliance offer. Gerald trusts you." });
    if (!result.ok) throw new Error(result.message);
    expect(announcementsFor(result.payloadsByPlayerId, "player-1")).toEqual(["Gerald accepted your alliance offer. Gerald trusts you."]);
  });
});

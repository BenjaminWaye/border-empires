import { describe, expect, it } from "vitest";

import { createSocialState } from "./social-state.js";

// Playtest 2026-11-12: a human declining your offer only dropped it from your
// list; nothing told the sender it was refused.
const announcementsFor = (payloads: Map<string, unknown[]>, playerId: string): unknown[] =>
  (payloads.get(playerId) ?? []).map((payload) => (payload as { announcement?: string }).announcement).filter(Boolean);

describe("declined offer announcements", () => {
  const setup = () =>
    createSocialState({
      now: () => 1_000,
      players: [
        { id: "player-1", name: "Lena" },
        { id: "player-2", name: "Tom" }
      ]
    });

  it("tells the sender when a human declines their alliance offer", () => {
    const social = setup();
    social.requestAlliance("player-1", "Tom");
    const id = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]!.id;
    const result = social.rejectAlliance("player-2", id);
    if (!result.ok) throw new Error(result.message);
    expect(announcementsFor(result.payloadsByPlayerId, "player-1")).toEqual(["Tom declined your alliance offer."]);
    expect(announcementsFor(result.payloadsByPlayerId, "player-2")).toEqual([]);
  });

  it("tells the sender when a human declines their truce offer", () => {
    const social = setup();
    social.requestTruce("player-1", "Tom", 24);
    const id = social.snapshotForPlayer("player-2").incomingTruceRequests[0]!.id;
    const result = social.rejectTruce("player-2", id);
    if (!result.ok) throw new Error(result.message);
    expect(announcementsFor(result.payloadsByPlayerId, "player-1")).toEqual(["Tom declined your 24h truce offer."]);
  });

  it("keeps an AI's own wording when it gives one", () => {
    const social = setup();
    social.requestAlliance("player-1", "Tom");
    const id = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]!.id;
    const result = social.rejectAlliance("player-2", id, { announcementByPlayerId: { "player-1": "Tom declined your alliance offer. Tom is wary of you." } });
    if (!result.ok) throw new Error(result.message);
    expect(announcementsFor(result.payloadsByPlayerId, "player-1")).toEqual(["Tom declined your alliance offer. Tom is wary of you."]);
  });
});

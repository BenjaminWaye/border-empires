import { describe, expect, it } from "vitest";

import { createSocialState } from "./social-state.js";

// First-15 round 1 owner decision: the recipient sees an offer's note on the card and in Chronicle → Yours.
const players = [
  { id: "player-1", name: "Lena" },
  { id: "player-2", name: "Linnea" }
];

describe("offer notes on truce and alliance offers", () => {
  it("carries a truce offer's note to the recipient's card and Chronicle row", () => {
    const social = createSocialState({ now: () => 1_000, players });
    expect(social.requestTruce("player-1", "Linnea", 12, { note: "Peace while we grow?" }).ok).toBe(true);
    expect(social.snapshotForPlayer("player-2").incomingTruceRequests[0]?.note).toBe("Peace while we grow?");
    expect(social.diplomacyActivityCards("player-2", 0, 1_000)).toEqual([expect.objectContaining({ event: "TRUCE_OFFERED", note: "Peace while we grow?" })]);
  });

  it("carries an alliance offer's note to both sides' Chronicle rows, and leaves rows without one bare", () => {
    const social = createSocialState({ now: () => 1_000, players });
    expect(social.requestAlliance("player-1", "Linnea", { note: "Together?" }).ok).toBe(true);
    expect(social.snapshotForPlayer("player-2").incomingAllianceRequests[0]?.note).toBe("Together?");
    for (const playerId of ["player-1", "player-2"]) {
      expect(social.diplomacyActivityCards(playerId, 0, 1_000)).toEqual([expect.objectContaining({ event: "ALLIANCE_OFFERED", note: "Together?" })]);
    }
    const plain = createSocialState({ now: () => 1_000, players });
    expect(plain.requestAlliance("player-1", "Linnea").ok).toBe(true);
    expect(plain.diplomacyActivityCards("player-2", 0, 1_000)[0]).not.toHaveProperty("note");
  });
});

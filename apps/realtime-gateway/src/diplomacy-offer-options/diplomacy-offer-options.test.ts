import { describe, expect, it } from "vitest";

import { createSocialState } from "../social-state/social-state.js";
import { offerOptionsFor } from "./diplomacy-offer-options.js";

describe("offerOptionsFor", () => {
  const terms = { give: { gold: 5, shard: 0 }, ask: { gold: 0, shard: 0 } };

  it("carries terms and the target id only when present", () => {
    expect(offerOptionsFor({})).toEqual({});
    expect(offerOptionsFor({ terms, targetPlayerId: "ai-3" })).toEqual({ terms, targetPlayerId: "ai-3" });
  });

  // Regression: a human who kept an AI's name ("Milo") received offers meant for the AI.
  it("routes an offer by id past a display name shared with a human", () => {
    const social = createSocialState({
      now: () => 1_000,
      players: [{ id: "player-1", name: "Nauticus" }, { id: "ai-3", name: "Milo" }, { id: "player-2", name: "Milo" }]
    });
    social.requestTruce("player-1", "Milo", 12, offerOptionsFor({ targetPlayerId: "ai-3" }));
    expect(social.snapshotForPlayer("player-1").outgoingTruceRequests).toEqual([expect.objectContaining({ toPlayerId: "ai-3" })]);
  });
});

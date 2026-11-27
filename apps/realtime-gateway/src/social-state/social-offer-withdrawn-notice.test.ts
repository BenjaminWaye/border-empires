// Playtest run 5 (pt-predator): accepting Maren's truce failed with "Maren
// withdrew its offer" while Accept was still on screen. When the server takes
// an offer back, the recipient's update drops it and says so in one line.
import { describe, expect, it } from "vitest";

import { createSocialState } from "./social-state.js";
import { withdrawnOfferAnnouncements } from "./social-state-types.js";

const players = [{ id: "maren", name: "Maren" }, { id: "me", name: "Me" }];
const updateOf = (payloads: unknown[] | undefined, type: string): Record<string, unknown> | undefined =>
  (payloads ?? []).find((payload) => (payload as { type?: string }).type === type) as Record<string, unknown> | undefined;

describe("server-withdrawn offers", () => {
  it("drops a withdrawn truce offer from the recipient's list with a terse line", () => {
    const social = createSocialState({ now: () => 1_000, players });
    social.requestTruce("maren", "Me", 12);
    const request = social.snapshotForPlayer("me").incomingTruceRequests[0]!;
    const result = social.cancelTruce("maren", request.id, withdrawnOfferAnnouncements("truce", request, "Maren"));
    if (!result.ok) throw new Error(result.message);
    const update = updateOf(result.payloadsByPlayerId.get("me"), "TRUCE_UPDATE");
    expect(update?.incomingTruceRequests).toEqual([]);
    expect(update?.announcement).toBe("Maren withdrew the truce offer.");
    // The sender (the AI) gets no line.
    expect(updateOf(result.payloadsByPlayerId.get("maren"), "TRUCE_UPDATE")).not.toHaveProperty("announcement");
  });

  it("does the same for an alliance offer", () => {
    const social = createSocialState({ now: () => 1_000, players });
    social.requestAlliance("maren", "Me");
    const request = social.snapshotForPlayer("me").incomingAllianceRequests[0]!;
    const result = social.cancelAlliance("maren", request.id, withdrawnOfferAnnouncements("alliance", request, "Maren"));
    if (!result.ok) throw new Error(result.message);
    const update = updateOf(result.payloadsByPlayerId.get("me"), "ALLIANCE_UPDATE");
    expect(update?.incomingAllianceRequests).toEqual([]);
    expect(update?.announcement).toBe("Maren withdrew the alliance offer.");
  });

  it("a sender's own withdraw stays silent", () => {
    const social = createSocialState({ now: () => 1_000, players });
    social.requestTruce("me", "Maren", 12);
    const request = social.snapshotForPlayer("me").outgoingTruceRequests[0]!;
    const result = social.cancelTruce("me", request.id);
    if (!result.ok) throw new Error(result.message);
    expect(updateOf(result.payloadsByPlayerId.get("maren"), "TRUCE_UPDATE")).not.toHaveProperty("announcement");
  });
});

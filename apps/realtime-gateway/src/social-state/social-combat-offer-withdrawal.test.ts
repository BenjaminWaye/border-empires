import { describe, expect, it } from "vitest";

import { createSocialState } from "./social-state.js";

const HOUR = 60 * 60_000;

const setup = () => {
  let clock = 1_000;
  const social = createSocialState({
    now: () => clock,
    players: [{ id: "p1", name: "Nauticus" }, { id: "p2", name: "Valka" }, { id: "p3", name: "Orsa" }]
  });
  return { social, advance: (ms: number) => { clock += ms; } };
};

describe("truce offers and fighting", () => {
  // Offline players get an email about an offer; it must still be there when they log in.
  it("keeps an unanswered truce offer for an offline player well past the old 5 minutes", () => {
    const { social, advance } = setup();
    expect(social.requestTruce("p1", "Valka", 12)).toEqual(expect.objectContaining({ ok: true }));
    advance(20 * HOUR);
    const offer = social.snapshotForPlayer("p2").incomingTruceRequests[0];
    expect(offer).toBeDefined();
    expect(social.acceptTruce("p2", offer!.id)).toEqual(expect.objectContaining({ ok: true }));
  });

  it("drops an offer after the week-long cleanup backstop", () => {
    const { social, advance } = setup();
    social.requestTruce("p1", "Valka", 12);
    advance(7 * 24 * HOUR + 1);
    expect(social.snapshotForPlayer("p2").incomingTruceRequests).toEqual([]);
  });

  // An old offer must not be accepted mid-war on peacetime terms.
  it("withdraws offers in both directions when the pair fights, and tells both players", () => {
    const { social } = setup();
    social.requestTruce("p1", "Valka", 12);
    social.requestTruce("p1", "Orsa", 12);
    const result = social.withdrawTruceOffersOnCombat("p2", "p1");
    expect(result?.ok).toBe(true);
    expect(social.snapshotForPlayer("p2").incomingTruceRequests).toEqual([]);
    expect(social.snapshotForPlayer("p1").outgoingTruceRequests).toEqual([expect.objectContaining({ toPlayerId: "p3" })]);
    const p1Payloads = JSON.stringify(result?.payloadsByPlayerId.get("p1"));
    expect(p1Payloads).toContain("Your truce offer to Valka was withdrawn because your empires fought.");
    expect(JSON.stringify(result?.payloadsByPlayerId.get("p2"))).toContain("Nauticus's truce offer was withdrawn because your empires fought.");
  });

  it("does nothing when there is no offer between the pair", () => {
    const { social } = setup();
    social.requestTruce("p1", "Orsa", 12);
    expect(social.withdrawTruceOffersOnCombat("p1", "p2")).toBeUndefined();
    expect(social.snapshotForPlayer("p3").incomingTruceRequests).toHaveLength(1);
  });
});

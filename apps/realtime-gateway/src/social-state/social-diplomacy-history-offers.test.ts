import { describe, expect, it } from "vitest";

import { createSocialState } from "./social-state.js";

// Persona playtest: truce extensions and alliance offers (sent, received,
// declined) never reached Chronicle → Yours, so players had no record of the
// diplomacy they had done or been offered.
const HOUR = 3_600_000;
const players = [
  { id: "player-1", name: "Lena" },
  { id: "player-2", name: "Linnea" }
];

const setup = () => {
  const clock = { now: 1_000_000 };
  const social = createSocialState({ now: () => clock.now, players });
  const events = (playerId: string) => social.diplomacyActivityCards(playerId, 0, clock.now).map((card) => ({ event: card.event, by: card.byPlayerId, hours: card.durationHours, at: card.occurredAt }));
  return { social, clock, events };
};

describe("Chronicle diplomacy rows", () => {
  it("logs a truce extension for both sides, at the time it was agreed", () => {
    const { social, clock, events } = setup();
    expect(social.requestTruce("player-1", "Linnea", 12).ok).toBe(true);
    expect(social.acceptTruce("player-2", social.snapshotForPlayer("player-2").incomingTruceRequests[0]!.id).ok).toBe(true);
    clock.now += 4 * HOUR;
    expect(social.requestTruce("player-1", "Linnea", 24).ok).toBe(true);
    expect(social.acceptTruce("player-2", social.snapshotForPlayer("player-2").incomingTruceRequests[0]!.id).ok).toBe(true);

    for (const playerId of ["player-1", "player-2"]) {
      expect(events(playerId)).toContainEqual({ event: "TRUCE_EXTENDED", by: undefined, hours: 24, at: clock.now });
    }
  });

  it("logs an alliance offer and its refusal, naming who offered and who declined", () => {
    const { social, events } = setup();
    const request = social.requestAlliance("player-1", "Linnea");
    expect(request.ok).toBe(true);
    const requestId = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]!.id;
    expect(social.rejectAlliance("player-2", requestId).ok).toBe(true);

    for (const playerId of ["player-1", "player-2"]) {
      const rows = events(playerId);
      expect(rows).toContainEqual(expect.objectContaining({ event: "ALLIANCE_OFFERED", by: "player-1" }));
      expect(rows).toContainEqual(expect.objectContaining({ event: "ALLIANCE_DECLINED", by: "player-2" }));
    }
  });

  // Review of #2783: a counter-offer (or an AI's failed payment) rejects the offer without a "no".
  it("logs no decline when the offer is set aside without a refusal", () => {
    const { social, events } = setup();
    expect(social.requestAlliance("player-1", "Linnea").ok).toBe(true);
    const requestId = social.snapshotForPlayer("player-2").incomingAllianceRequests[0]!.id;
    expect(social.rejectAlliance("player-2", requestId, { startCooldown: false, recordDecline: false }).ok).toBe(true);
    expect(events("player-1").map((row) => row.event)).not.toContain("ALLIANCE_DECLINED");
  });
});

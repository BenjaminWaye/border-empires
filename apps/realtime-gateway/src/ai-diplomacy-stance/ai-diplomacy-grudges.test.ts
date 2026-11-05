import { describe, expect, it } from "vitest";

import { BROKEN_PACT_OPINION_WINDOW_MS } from "@border-empires/shared";

import { aiDiplomacyGrudges } from "./ai-diplomacy-grudges.js";

const NOW = 100 * BROKEN_PACT_OPINION_WINDOW_MS;
const DAY = 24 * 60 * 60_000;

const allianceBreak = (overrides: { otherPlayerId?: string; createdByPlayerId?: string; startedAt?: number } = {}) => ({
  otherPlayerId: "ai-1",
  otherPlayerName: "Milo",
  startedAt: NOW - DAY,
  endsAt: NOW,
  createdByPlayerId: "me",
  ...overrides
});

describe("aiDiplomacyGrudges", () => {
  it("counts truces broken with others only for 7 days, but keeps the betrayed AI's grudge all season", () => {
    const grudges = aiDiplomacyGrudges(
      {
        truceBreaksThisSeason: [
          { targetPlayerId: "ai-1", targetPlayerName: "Milo", brokenAt: NOW - 30 * DAY },
          { targetPlayerId: "p-2", targetPlayerName: "Ana", brokenAt: NOW - 2 * DAY },
          { targetPlayerId: "p-3", targetPlayerName: "Bo", brokenAt: NOW - 8 * DAY }
        ],
        activeAllianceBreaks: [],
        recentAllianceBreaks: []
      },
      "me",
      "ai-1",
      NOW
    );
    expect(grudges).toEqual({ requesterBrokeTruceWithAi: true, requesterTruceBreaksWithOthers: 1, requesterBrokeAllianceWithAi: false });
  });

  it("remembers an alliance the requester started breaking with this AI for 7 days", () => {
    const snapshot = (notice: ReturnType<typeof allianceBreak>, finalized: boolean) => ({
      truceBreaksThisSeason: [],
      activeAllianceBreaks: finalized ? [] : [notice],
      recentAllianceBreaks: finalized ? [{ ...notice, finalizedAt: notice.endsAt }] : []
    });
    expect(aiDiplomacyGrudges(snapshot(allianceBreak(), false), "me", "ai-1", NOW).requesterBrokeAllianceWithAi).toBe(true);
    expect(aiDiplomacyGrudges(snapshot(allianceBreak({ startedAt: NOW - 6 * DAY }), true), "me", "ai-1", NOW).requesterBrokeAllianceWithAi).toBe(true);
    expect(aiDiplomacyGrudges(snapshot(allianceBreak({ startedAt: NOW - 8 * DAY }), true), "me", "ai-1", NOW).requesterBrokeAllianceWithAi).toBe(false);
    // The AI broke it, not the requester: no grudge against the requester.
    expect(aiDiplomacyGrudges(snapshot(allianceBreak({ createdByPlayerId: "ai-1" }), false), "me", "ai-1", NOW).requesterBrokeAllianceWithAi).toBe(false);
    expect(aiDiplomacyGrudges(snapshot(allianceBreak({ otherPlayerId: "ai-2" }), false), "me", "ai-1", NOW).requesterBrokeAllianceWithAi).toBe(false);
  });
});

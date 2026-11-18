import { describe, expect, it } from "vitest";

import type { AiOpinion, AiWarState } from "./ai-diplomacy-opinion.js";
import { spareCoinPerHour, warReason } from "./ai-diplomacy-evaluation.js";

const SPENT = "Rowan is looking for peace: their armies are spent.";
const opinion = (war: Partial<AiWarState>): AiOpinion => ({
  attitude: "CAUTIOUS",
  score: 0,
  modifiers: [],
  war: { atWar: false, balance: 0, tilesTakenFromAi: 0, tilesTakenByAi: 0, aiWinning: false, aiLosing: false, ...war }
});

// Playtest 2026-11-13 (pt-diplomat): Rowan took 11 tiles and a Dock overnight,
// and seven hours later (past the 6h at-war window) his card said only
// "looking for peace: their armies are spent", as if nothing had happened.
describe("warReason after the at-war window", () => {
  it("says what the AI took from you before its stance", () => {
    expect(warReason("Rowan", opinion({ tilesTakenByAi: 7 }), { kind: "STEADY" }, SPENT)).toBe(`Rowan took 7 of your tiles recently. ${SPENT}`);
    expect(warReason("Rowan", opinion({ tilesTakenByAi: 1 }), { kind: "STEADY" }, SPENT)).toBe(`Rowan took 1 of your tiles recently. ${SPENT}`);
  });

  it("keeps the plain stance when it took nothing", () => {
    expect(warReason("Rowan", opinion({}), { kind: "STEADY" }, SPENT)).toBe(SPENT);
  });

  it("leaves at-war reasons as they were", () => {
    expect(warReason("Rowan", opinion({ atWar: true, tilesTakenByAi: 5, aiWinning: true }), { kind: "STEADY" }, SPENT)).toBe("Rowan feels they're winning this war.");
  });
});

// Review regression: an AI counted any Coin-per-hour pledge in full, however little the requester earns.
describe("spareCoinPerHour", () => {
  it("is earned Coin per hour less what the requester already pledges, never negative, and unknown when unread", () => {
    const snapshot = (incomePerMinute: number | undefined, pledged = 0) => ({
      playerId: "me", tiles: [],
      player: { manpower: 0, manpowerCap: 0, ...(incomePerMinute === undefined ? {} : { incomePerMinute }),
        resourceTradeAgreements: pledged ? [{ id: "a", proposerId: "me", targetId: "x", proposerGives: {}, targetGives: {}, proposerCoinPerHour: pledged, startedAt: 0, expiresAt: 1, fulfilled: true }] : [] }
    });
    expect(spareCoinPerHour(snapshot(2))).toBe(120);
    expect(spareCoinPerHour(snapshot(2, 100))).toBe(20);
    expect(spareCoinPerHour(snapshot(1, 100))).toBe(0);
    expect(spareCoinPerHour(snapshot(undefined))).toBeUndefined();
    expect(spareCoinPerHour(undefined)).toBeUndefined();
  });
});

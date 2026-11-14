import { describe, expect, it } from "vitest";

import type { AiOpinion, AiWarState } from "./ai-diplomacy-opinion.js";
import { warReason } from "./ai-diplomacy-evaluation.js";

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

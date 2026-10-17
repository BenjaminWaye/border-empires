import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { computeAiDiplomacyStance, type AiDiplomacyStanceInput } from "./ai-diplomacy-stance.js";
import { bordersTouchInTiles, musterManpowerFromTiles } from "./ai-diplomacy-stance-input.js";

const baseInput = (overrides: Partial<AiDiplomacyStanceInput> = {}, ai: Partial<AiDiplomacyStanceInput["ai"]> = {}): AiDiplomacyStanceInput => ({
  aiName: "Milo",
  ai: { manpower: 800, manpowerCap: 1000, musterManpower: 0, score: 100, foodStock: 500, foodNetPerMinute: 5, ...ai },
  requester: { score: 100, manpowerCap: 1000 },
  bordersTouch: true,
  requesterBrokeTruceWithAi: false,
  ...overrides
});

describe("computeAiDiplomacyStance", () => {
  it("is wary of an evenly matched neighbour and declines both offers", () => {
    expect(computeAiDiplomacyStance(baseInput())).toEqual(
      expect.objectContaining({ kind: "WARY", acceptsTruce: false, acceptsAlliance: false })
    );
  });

  it("feels it's winning against a clearly weaker neighbour", () => {
    const stance = computeAiDiplomacyStance(baseInput({ requester: { score: 60, manpowerCap: 1000 } }));
    expect(stance).toEqual(expect.objectContaining({ kind: "WINNING", acceptsTruce: false }));
    expect(stance.reason).toBe("Milo feels they're winning and wants to keep fighting.");
  });

  it("fears a clearly stronger player and accepts both offers", () => {
    expect(computeAiDiplomacyStance(baseInput({ requester: { score: 130, manpowerCap: 1000 } }))).toEqual(
      expect.objectContaining({ kind: "OUTMATCHED", acceptsTruce: true, acceptsAlliance: true })
    );
  });

  it("takes a truce but not an alliance from a player whose borders don't meet its own", () => {
    expect(computeAiDiplomacyStance(baseInput({ bordersTouch: false }))).toEqual(
      expect.objectContaining({ kind: "INDIFFERENT", acceptsTruce: true, acceptsAlliance: false })
    );
  });

  it("seeks peace once free plus mustered manpower is spent", () => {
    expect(computeAiDiplomacyStance(baseInput({}, { manpower: 100, musterManpower: 50 }))).toEqual(
      expect.objectContaining({ kind: "SEEKING_PEACE", acceptsTruce: true })
    );
  });

  // Regression: manpower parked in muster flags is still the AI's strength.
  it("does not seek peace when the free pool is low only because manpower is mustered", () => {
    expect(computeAiDiplomacyStance(baseInput({}, { manpower: 50, musterManpower: 600 })).kind).toBe("WARY");
  });

  it("seeks peace when its food will run out within minutes", () => {
    const stance = computeAiDiplomacyStance(baseInput({}, { foodStock: 20, foodNetPerMinute: -5 }));
    expect(stance).toEqual(expect.objectContaining({ kind: "SEEKING_PEACE", acceptsTruce: true }));
    expect(stance.reason).toContain("food");
  });

  it("uses current FOOD capacity ahead of retired stockpile projections", () => {
    expect(computeAiDiplomacyStance(baseInput({}, { foodSlotDeficit: 1, foodStock: 10000 })).kind).toBe("SEEKING_PEACE");
    expect(computeAiDiplomacyStance(baseInput({}, { foodSlotDeficit: 0, foodStock: 0, foodNetPerMinute: -100 })).kind).toBe("WARY");
  });
  it("only allies with a desperate AI's equal or better", () => {
    const spent = { manpower: 0 };
    expect(computeAiDiplomacyStance(baseInput({ requester: { score: 100, manpowerCap: 1000 } }, spent)).acceptsAlliance).toBe(true);
    expect(computeAiDiplomacyStance(baseInput({ requester: { score: 50, manpowerCap: 1000 } }, spent)).acceptsAlliance).toBe(false);
  });

  it("refuses everything from a player who broke a truce with it, even when desperate", () => {
    expect(computeAiDiplomacyStance(baseInput({ requesterBrokeTruceWithAi: true }, { manpower: 0 }))).toEqual(
      expect.objectContaining({ kind: "DISTRUSTFUL", acceptsTruce: false, acceptsAlliance: false })
    );
  });

  it("compares manpower caps when either score is missing", () => {
    const stance = computeAiDiplomacyStance(
      baseInput({ requester: { score: undefined, manpowerCap: 2000 } }, { score: 100 })
    );
    expect(stance.kind).toBe("OUTMATCHED");
  });
});

describe("stance inputs from snapshot tiles", () => {
  const tiles = [
    { x: 0, y: 0, ownerId: "ai-1", musterJson: JSON.stringify({ ownerId: "ai-1", amount: 120 }) },
    { x: 5, y: 5, ownerId: "ai-1", musterJson: JSON.stringify({ ownerId: "human-1", amount: 999 }) },
    { x: 6, y: 5, ownerId: "ai-1", musterJson: "{not json" },
    { x: 1, y: 0, ownerId: "human-1" }
  ] as PlayerSubscriptionSnapshot["tiles"];

  it("sums only the AI's own muster flags and skips malformed ones", () => {
    expect(musterManpowerFromTiles(tiles, "ai-1")).toBe(120);
  });

  it("detects orthogonally adjacent borders", () => {
    expect(bordersTouchInTiles(tiles, "ai-1", "human-1")).toBe(true);
    expect(bordersTouchInTiles(tiles, "ai-1", "human-2")).toBe(false);
  });

  it("does not treat diagonal contact as a shared border", () => {
    const diagonal = [
      { x: 0, y: 0, ownerId: "ai-1" },
      { x: 1, y: 1, ownerId: "human-1" }
    ] as PlayerSubscriptionSnapshot["tiles"];
    expect(bordersTouchInTiles(diagonal, "ai-1", "human-1")).toBe(false);
  });
});

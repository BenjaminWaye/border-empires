import { describe, expect, it } from "vitest";

import { AI_TEMPERAMENTS, aiAsksForPeace, aiTemperamentForId } from "./ai-diplomacy-temperament.js";

describe("aiTemperamentForId", () => {
  it("gives any five consecutive AIs one of each, and repeats", () => {
    const kinds = ["ai-1", "ai-2", "ai-3", "ai-4", "ai-5"].map((id) => aiTemperamentForId(id).kind);
    expect(new Set(kinds).size).toBe(5);
    expect(aiTemperamentForId("ai-6").kind).toBe(kinds[0]);
    expect(aiTemperamentForId("ai-20").kind).toBe(kinds[4]);
  });

  it("treats any other id as Measured", () => {
    expect(aiTemperamentForId("human-7").kind).toBe("MEASURED");
    expect(aiTemperamentForId("barbarian-1").kind).toBe("MEASURED");
  });
});

describe("aiAsksForPeace", () => {
  it("keeps a Warlike AI from asking merely because it is outmatched", () => {
    expect(aiAsksForPeace("OUTMATCHED", AI_TEMPERAMENTS.MEASURED)).toBe(true);
    expect(aiAsksForPeace("OUTMATCHED", AI_TEMPERAMENTS.WARLIKE)).toBe(false);
  });

  it("has every temperament ask when desperate, and none when not threatened", () => {
    for (const temperament of Object.values(AI_TEMPERAMENTS)) {
      expect(aiAsksForPeace("SEEKING_PEACE", temperament)).toBe(true);
      expect(aiAsksForPeace("WARY", temperament)).toBe(false);
    }
  });
});

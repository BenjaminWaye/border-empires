import { describe, expect, it } from "vitest";

import {
  aiDisplayNameForId,
  aiNameFromStored,
  legacySeasonalAiNameForId,
  numberedAiNameForId,
  SEASONAL_AI_NAMES,
  seasonalAiNameForId
} from "./seasonal-ai-names.js";

describe("seasonal AI names", () => {
  it("names ai-<n> from the House list, cycling with a numeral past its end, and ignores other ids", () => {
    expect(seasonalAiNameForId("ai-1")).toBe("House Brassmoor");
    expect(seasonalAiNameForId("ai-13")).toBe("House Umberly");
    expect(aiDisplayNameForId("ai-13")).toBe("House Umberly");
    expect(aiDisplayNameForId("ai-21")).toBe("House Brassmoor II");
    expect(aiDisplayNameForId("ai-41")).toBe("House Brassmoor III");
    expect(numberedAiNameForId("ai-21")).toBe("AI 21");
    expect(aiDisplayNameForId("player-1")).toBeUndefined();
    expect(aiDisplayNameForId("barbarian-1")).toBeUndefined();
  });

  // First-15 round 1 (2026-11-28): AIs read as "Tove" beside "House Ashgrove"; every AI is now a House.
  it("every listed name is a unique House name that fits the name limit", () => {
    for (const name of SEASONAL_AI_NAMES) {
      expect(name).toMatch(/^House [A-Z][a-z]+$/);
      expect(`${name} X`.length).toBeLessThanOrEqual(24);
    }
    expect(new Set(SEASONAL_AI_NAMES).size).toBe(SEASONAL_AI_NAMES.length);
  });

  // Regression: gateways stored "AI 13" before AIs used their listed names; a restart must not keep it.
  it("replaces placeholder stored names but keeps real ones", () => {
    expect(aiNameFromStored("ai-13", "AI 13")).toBe("House Umberly");
    expect(aiNameFromStored("ai-13", "ai-13")).toBe("House Umberly");
    expect(aiNameFromStored("ai-13", undefined)).toBe("House Umberly");
    expect(aiNameFromStored("ai-13", "Lord Maren")).toBe("Lord Maren");
    expect(aiNameFromStored("ai-21", "AI 21")).toBe("House Brassmoor II");
    expect(aiNameFromStored("player-1", "player-1")).toBe("player-1");
  });

  // A season begun before House names stores the AI's bare name; it must show the House name everywhere.
  it("reads the pre-House bare name of the same AI as a placeholder", () => {
    expect(legacySeasonalAiNameForId("ai-10")).toBe("Tove");
    expect(aiNameFromStored("ai-10", "Tove")).toBe("House Rookstead");
    expect(aiNameFromStored("ai-10", "Maren")).toBe("Maren");
  });
});

import { describe, expect, it } from "vitest";

import { aiDisplayNameForId, aiNameFromStored, numberedAiNameForId, seasonalAiNameForId } from "./seasonal-ai-names.js";

describe("seasonal AI names", () => {
  it("names ai-<n> from the list, numbered past its end, and ignores other ids", () => {
    expect(seasonalAiNameForId("ai-1")).toBe("Alden");
    expect(seasonalAiNameForId("ai-13")).toBe("Maren");
    expect(aiDisplayNameForId("ai-13")).toBe("Maren");
    expect(aiDisplayNameForId("ai-21")).toBe("AI 21");
    expect(numberedAiNameForId("ai-21")).toBe("AI 21");
    expect(aiDisplayNameForId("player-1")).toBeUndefined();
    expect(aiDisplayNameForId("barbarian-1")).toBeUndefined();
  });

  // Regression: gateways stored "AI 13" before AIs used their listed names; a restart must not keep it.
  it("replaces placeholder stored names but keeps real ones", () => {
    expect(aiNameFromStored("ai-13", "AI 13")).toBe("Maren");
    expect(aiNameFromStored("ai-13", "ai-13")).toBe("Maren");
    expect(aiNameFromStored("ai-13", undefined)).toBe("Maren");
    expect(aiNameFromStored("ai-13", "Lord Maren")).toBe("Lord Maren");
    expect(aiNameFromStored("ai-21", "AI 21")).toBe("AI 21");
    expect(aiNameFromStored("player-1", "player-1")).toBe("player-1");
  });
});

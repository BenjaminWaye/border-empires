import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGalaxyHoldings, trophyCaseHtml } from "./client-player-profile-galaxy.js";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchGalaxyHoldings", () => {
  it("returns the parsed planets/outposts on a successful response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ planets: [{ seasonSequence: 1 }], outposts: [] })
    }) as unknown as typeof fetch;

    const result = await fetchGalaxyHoldings("player-1", "ws://localhost:3101/ws");
    expect(result).toEqual({ planets: [{ seasonSequence: 1 }], outposts: [], trophyCase: [] });
  });

  it("returns undefined on a non-ok response instead of throwing", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const result = await fetchGalaxyHoldings("player-1", "ws://localhost:3101/ws");
    expect(result).toBeUndefined();
  });

  it("returns undefined on a network error instead of throwing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const result = await fetchGalaxyHoldings("player-1", "ws://localhost:3101/ws");
    expect(result).toBeUndefined();
  });
});

describe("trophyCaseHtml", () => {
  it("renders nothing while loading, undefined, or with an empty trophy case", () => {
    expect(trophyCaseHtml("loading")).toBe("");
    expect(trophyCaseHtml(undefined)).toBe("");
    expect(trophyCaseHtml({ planets: [], outposts: [], trophyCase: [] })).toBe("");
  });

  it("renders a trophy per victory condition with its win count", () => {
    const html = trophyCaseHtml({
      planets: [],
      outposts: [],
      trophyCase: [
        { objectiveId: "TOWN_CONTROL", objectiveName: "Town Control", count: 2 },
        { objectiveId: "DIPLOMATIC_DOMINANCE", objectiveName: "Diplomatic Dominance", count: 1 }
      ]
    });
    expect(html).toContain("Career Trophy Case");
    expect(html).toContain("Town Control ×2");
    expect(html).toContain("Diplomatic Dominance ×1");
    expect(html).toContain("🏰");
    expect(html).toContain("🤝");
  });
});

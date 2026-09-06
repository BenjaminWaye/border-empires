import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGalaxyHoldings } from "./client-player-profile-galaxy.js";

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
    expect(result).toEqual({ planets: [{ seasonSequence: 1 }], outposts: [] });
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

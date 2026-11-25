import { describe, expect, it } from "vitest";

import { resolveLobbyDisplay, type LobbyDisplayLookup } from "./lobby-display-lookup.js";

const lookup = (getTitle?: LobbyDisplayLookup["getTitle"]): LobbyDisplayLookup => ({
  getOverride: () => ({ name: "Varn", countryFlag: "SE" }),
  getStoredProfile: async () => undefined,
  fallbackName: () => "Fallback",
  ...(getTitle ? { getTitle } : {})
});

describe("resolveLobbyDisplay", () => {
  it("adds the account's title", async () => {
    expect(await resolveLobbyDisplay("p1", lookup(async () => "Count"))).toEqual({ name: "Varn", countryFlag: "SE", title: "Count" });
  });

  it("still resolves, without a title, when the title lookup fails", async () => {
    const failing = lookup(async () => { throw new Error("database is locked"); });
    expect(await resolveLobbyDisplay("p1", failing)).toEqual({ name: "Varn", countryFlag: "SE" });
  });
});

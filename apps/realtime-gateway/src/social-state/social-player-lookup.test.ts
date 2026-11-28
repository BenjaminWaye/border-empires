import { describe, expect, it } from "vitest";

import { resolveSocialPlayerByName } from "./social-player-lookup.js";
import type { SocialPlayerRecord } from "./social-state-types.js";

const players = (...records: Array<[string, string]>): Map<string, SocialPlayerRecord> =>
  new Map(records.map(([id, name]) => [id, { id, name, allies: new Set<string>() }]));

describe("resolveSocialPlayerByName", () => {
  it("finds an AI by its House name", () => {
    expect(resolveSocialPlayerByName(players(["ai-10", "House Rookstead"]), "house rookstead")?.id).toBe("ai-10");
  });

  // AIs were called "Tove" etc. before House names (2026-11-28); an offer typed from an old screen must still reach them.
  it("still finds an AI by its pre-House name and its old numbered name", () => {
    const byId = players(["ai-10", "House Rookstead"], ["p1", "Ada"]);
    expect(resolveSocialPlayerByName(byId, "Tove")?.id).toBe("ai-10");
    expect(resolveSocialPlayerByName(byId, "AI 10")?.id).toBe("ai-10");
  });

  it("a human who holds that old name wins the tie", () => {
    expect(resolveSocialPlayerByName(players(["ai-10", "House Rookstead"], ["p1", "Tove"]), "tove")?.id).toBe("p1");
  });
});

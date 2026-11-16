import { describe, expect, it } from "vitest";
import { diplomacyEmpires, diplomacyListHtml } from "./client-hud-v2-diplomacy.js";
import { rivalTokens } from "./client-hud-v2-rivals.js";

// Playtest (Henrik, day 3): an enemy's empire card still said MET, with a tile
// count that didn't move, after the war started. Both the rivals strip and the
// Diplomacy cards only knew ally / truce / met; and the count is the
// leaderboard's garrisoned tiles, which frontier land changing hands never moves.
describe("an empire at war with you", () => {
  it("reads WAR first on the rivals strip, never over an ally or truce", () => {
    const { shown } = rivalTokens({
      me: "me",
      metPlayerIds: new Set(["a", "b", "w"]),
      allies: ["a"],
      activeTruces: [],
      warPlayerIds: new Set(["w", "a"]),
      nameOf: (id) => `Empire ${id}`,
      colorOf: () => "#123456",
      nowMs: 0
    });
    expect(shown.map((t) => [t.id, t.stance, t.label])).toEqual([["w", "war", "WAR"], ["a", "ally", "ALLY"], ["b", "met", "NO PACT"]]);
  });

  it("reads War first on the Diplomacy list, with its count named as garrisoned tiles", () => {
    const input = {
      me: "me",
      metPlayerIds: new Set(["a", "d"]),
      allies: [],
      activeTruces: [],
      incomingAlliance: [],
      incomingTruce: [],
      leaderboard: [{ id: "a", name: "a", tiles: 10, incomePerMinute: 0, techs: 0, manpowerCap: 0, score: 0, rank: 2 }, { id: "d", name: "d", tiles: 1204, incomePerMinute: 0, techs: 0, manpowerCap: 0, score: 0, rank: 1 }],
      warPlayerIds: new Set(["a"]),
      nameOf: (id: string) => id.toUpperCase(),
      colorOf: () => undefined,
      nowMs: 0
    };
    expect(diplomacyEmpires(input).map((e) => [e.id, e.stance.label])).toEqual([["a", "War"], ["d", "Met"]]);
    const html = diplomacyListHtml(input);
    expect(html).toContain('class="v2d-emp v2d-emp-war" data-v2-dip-open="a"');
    expect(html).toContain('<span class="v2d-emp-stance">War</span><span class="v2d-emp-tiles">10 garrisoned tiles</span>');
    expect(html).toContain('<span class="v2d-emp-tiles">1,204 garrisoned tiles</span>');
  });
});

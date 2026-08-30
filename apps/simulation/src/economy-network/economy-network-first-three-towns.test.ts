import { describe, expect, it } from "vitest";
import { firstThreeTownKeysForPlayer } from "./economy-network-first-three-towns.js";

// Regression: a bare, unnamed starting SETTLEMENT (every settled tile has
// town data, not just a player's actual named/grown cities) used to count
// toward Mercantile Charter's "first three towns" the same as a real TOWN+
// tier city — silently eating a slot ahead of the cities the domain's own
// catalog description ("your first three cities") actually means, so an
// established player's real towns never got the bonus at all. Split into
// its own file since economy-network.test.ts is already over the repo's
// 500-line cap.
describe("firstThreeTownKeysForPlayer", () => {
  it("excludes SETTLEMENT-tier entries from the first-three set", () => {
    const entries: Array<readonly [string, string | undefined]> = [
      ["0,0", "SETTLEMENT"],
      ["10,10", "TOWN"],
      ["20,10", "TOWN"],
      ["30,10", "TOWN"]
    ];
    const result = firstThreeTownKeysForPlayer("player-1", entries);
    expect(result).toEqual(new Set(["10,10", "20,10", "30,10"]));
  });

  it("stops at three eligible (non-SETTLEMENT) entries", () => {
    const entries: Array<readonly [string, string | undefined]> = [
      ["10,10", "TOWN"],
      ["20,10", "TOWN"],
      ["30,10", "TOWN"],
      ["40,10", "CITY"]
    ];
    const result = firstThreeTownKeysForPlayer("player-1", entries);
    expect(result).toEqual(new Set(["10,10", "20,10", "30,10"]));
  });
});

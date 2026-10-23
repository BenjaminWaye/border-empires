import { PERSONAL_ACTIVITY_RIVAL_CAP } from "@border-empires/game-domain";
import { describe, expect, it } from "vitest";

import { BARBARIAN_PLAYER_ID } from "../ai/system-job-barbarian-planner.js";
import { rivalsForPlayer } from "./personal-activity-rivals.js";
import { testCombat, testFlip } from "./personal-activity-test-fixtures.js";

describe("rivalsForPlayer", () => {
  it("tallies tiles and failed attacks per opponent, most active first", () => {
    const rivals = rivalsForPlayer("me", [
      testFlip({ fromOwner: "hugo", toOwner: "me" }),
      testFlip({ fromOwner: "me", toOwner: "hugo" }),
      testFlip({ fromOwner: "hugo", toOwner: "me" }),
      testFlip({ fromOwner: "maren", toOwner: "me" })
    ], [
      testCombat({ attackerId: "maren", defenderId: "me" }),
      testCombat({ attackerId: "me", defenderId: "maren" }),
      testCombat({ attackerId: "me", defenderId: "maren" }),
      testCombat({ attackerId: "me", defenderId: "maren", attackerWon: true })
    ]);
    expect(rivals).toEqual([
      { playerId: "maren", tilesTaken: 1, tilesLost: 0, attacksRepelled: 1, attacksFailed: 2 },
      { playerId: "hugo", tilesTaken: 2, tilesLost: 1, attacksRepelled: 0, attacksFailed: 0 }
    ]);
  });

  it("leaves out barbarians, neutral land and other players' fights, and caps the list", () => {
    const flips = [
      testFlip({ fromOwner: BARBARIAN_PLAYER_ID, toOwner: "me" }),
      testFlip({ fromOwner: undefined, toOwner: "me" }),
      testFlip({ fromOwner: "kara", toOwner: "hugo" }),
      ...Array.from({ length: PERSONAL_ACTIVITY_RIVAL_CAP + 2 }, (_, i) => testFlip({ fromOwner: `rival-${i}`, toOwner: "me" }))
    ];
    const rivals = rivalsForPlayer("me", flips, []);
    expect(rivals).toHaveLength(PERSONAL_ACTIVITY_RIVAL_CAP);
    expect(rivals.map((entry) => entry.playerId)).not.toContain(BARBARIAN_PLAYER_ID);
    expect(rivals.map((entry) => entry.playerId)).not.toContain("kara");
  });
});

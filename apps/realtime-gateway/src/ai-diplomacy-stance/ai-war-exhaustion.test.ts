import { describe, expect, it } from "vitest";

import { manpowerPerBatch, nextManpowerRefillAtMs } from "@border-empires/shared";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { computeAiDiplomacyStance, type AiDiplomacyStanceInput } from "./ai-diplomacy-stance.js";
import { buildAiDiplomacyStanceInput, hasOtherExpansionInTiles } from "./ai-diplomacy-stance-input.js";
import { REFILL_SOON_MS, warExhaustion, type WarExhaustionInput } from "./ai-war-exhaustion.js";

const spent: WarExhaustionInput = { manpower: 50, manpowerCap: 1000, musterManpower: 0 };
const strongRival = { fightingStrength: 800, manpowerCap: 1000 };

describe("warExhaustion", () => {
  it("is exhausted when spent, the refill is far off, the rival is strong and there is room to grow", () => {
    expect(warExhaustion({ ...spent, nextRefillInMs: 3 * 60 * 60 * 1000, nextRefillManpower: 500, hasOtherExpansion: true }, strongRival, true)).toBe("EXHAUSTED");
  });

  it("is not exhausted above 20% of cap", () => {
    expect(warExhaustion({ ...spent, manpower: 300 }, strongRival, true)).toBe("NOT_EXHAUSTED");
  });

  it("waits out a refill that lands soon and lifts it back over 20%", () => {
    expect(warExhaustion({ ...spent, nextRefillInMs: REFILL_SOON_MS - 1, nextRefillManpower: 500 }, strongRival, true)).toBe("REFILL_SOON");
  });

  it("still counts as exhausted when the coming refill is too small to matter", () => {
    expect(warExhaustion({ ...spent, nextRefillInMs: 60_000, nextRefillManpower: 100 }, strongRival, true)).toBe("EXHAUSTED");
  });

  it("doesn't fear a rival no stronger than itself", () => {
    expect(warExhaustion(spent, { fightingStrength: 40, manpowerCap: 1000 }, true)).toBe("RIVAL_ALSO_SPENT");
  });

  it("doesn't fear a rival that is itself under 20% of its cap", () => {
    expect(warExhaustion({ ...spent, manpower: 10 }, { fightingStrength: 150, manpowerCap: 1000 }, true)).toBe("RIVAL_ALSO_SPENT");
  });

  it("won't wall off its only way to grow with a truce on that border", () => {
    expect(warExhaustion({ ...spent, hasOtherExpansion: false }, strongRival, true)).toBe("BOXED_IN");
    // A rival whose borders don't meet the AI's isn't the growth path.
    expect(warExhaustion({ ...spent, hasOtherExpansion: false }, strongRival, false)).toBe("EXHAUSTED");
  });

  it("falls back to plain exhaustion when refill, rival and expansion are unknown", () => {
    expect(warExhaustion(spent, {}, true)).toBe("EXHAUSTED");
  });
});

const stanceInput = (ai: Partial<AiDiplomacyStanceInput["ai"]>, requester: Partial<AiDiplomacyStanceInput["requester"]> = {}): AiDiplomacyStanceInput => ({
  aiName: "Milo",
  ai: { ...spent, score: 100, foodStock: 500, foodNetPerMinute: 5, ...ai },
  requester: { score: 100, manpowerCap: 1000, ...requester },
  bordersTouch: true,
  requesterBrokeTruceWithAi: false
});

describe("computeAiDiplomacyStance exhaustion gates", () => {
  // Regression: before this, any AI under 20% sought peace, even 30 min from a refill.
  it("doesn't seek peace 30 minutes before a refill that restores its army", () => {
    expect(computeAiDiplomacyStance(stanceInput({ nextRefillInMs: 30 * 60_000, nextRefillManpower: 600 })).kind).toBe("WARY");
  });

  it("doesn't seek peace from an equally spent rival", () => {
    expect(computeAiDiplomacyStance(stanceInput({}, { fightingStrength: 20 })).kind).toBe("WARY");
  });

  it("doesn't seek peace when boxed in by the rival", () => {
    expect(computeAiDiplomacyStance(stanceInput({ hasOtherExpansion: false }, { fightingStrength: 800 })).kind).toBe("WARY");
  });

  it("still seeks peace when starving, whatever the army state", () => {
    expect(computeAiDiplomacyStance(stanceInput({ hasOtherExpansion: false, foodStock: 0, foodNetPerMinute: -1 }, { fightingStrength: 20 })).kind).toBe("SEEKING_PEACE");
  });

  it("still seeks peace when genuinely spent against a strong rival with room to grow", () => {
    expect(computeAiDiplomacyStance(stanceInput({ hasOtherExpansion: true }, { fightingStrength: 800 })).kind).toBe("SEEKING_PEACE");
  });
});

type Tile = PlayerSubscriptionSnapshot["tiles"][number];
const tile = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ...extra });

describe("hasOtherExpansionInTiles", () => {
  it("finds neutral land inside the AI's reach next to its territory, diagonals included", () => {
    expect(hasOtherExpansionInTiles([tile(5, 5, { ownerId: "ai-1" }), tile(6, 6, { reachOwnerId: "ai-1" })], "ai-1")).toBe(true);
  });

  it("ignores neutral land outside its reach, water and rival ground", () => {
    expect(hasOtherExpansionInTiles([
      tile(5, 5, { ownerId: "ai-1" }),
      tile(6, 5),
      tile(4, 5, { terrain: "SEA", reachOwnerId: "ai-1" }),
      tile(5, 6, { ownerId: "player-2", reachOwnerId: "player-2" })
    ], "ai-1")).toBe(false);
  });

  it("counts barbarian ground as room to grow", () => {
    expect(hasOtherExpansionInTiles([tile(5, 5, { ownerId: "ai-1" }), tile(5, 6, { ownerId: "barbarian-1" })], "ai-1")).toBe(true);
  });

  it("is unknown, not boxed in, when a neutral neighbour carries no terrain", () => {
    expect(hasOtherExpansionInTiles([tile(5, 5, { ownerId: "ai-1" }), { x: 6, y: 5 }, tile(4, 5, { ownerId: "player-2" })], "ai-1")).toBeUndefined();
  });

  it("is unknown when the snapshot carries no terrain", () => {
    expect(hasOtherExpansionInTiles([{ x: 5, y: 5, ownerId: "ai-1" }], "ai-1")).toBeUndefined();
  });
});

describe("buildAiDiplomacyStanceInput refill and rival fields", () => {
  const now = 1_793_500_000_000;
  const snapshot = (playerId: string, manpower: number, tiles: Tile[] = []) => ({
    playerId,
    tiles,
    player: { manpower, manpowerCap: 1000, manpowerRegenPerMinute: 2 }
  });

  it("reads time to the AI's next refill and its payout, and the rival's free plus mustered manpower", () => {
    const input = buildAiDiplomacyStanceInput({
      aiPlayerId: "ai-1",
      aiName: "Milo",
      aiSnapshot: snapshot("ai-1", 50),
      requesterId: "player-2",
      requesterSnapshot: snapshot("player-2", 30, [tile(1, 1, { ownerId: "player-2", musterJson: JSON.stringify({ ownerId: "player-2", amount: 70 }) })]),
      requesterBrokeTruceWithAi: false,
      now
    });
    expect(input?.ai.nextRefillInMs).toBe(nextManpowerRefillAtMs("ai-1", now) - now);
    expect(input?.ai.nextRefillManpower).toBe(Math.min(950, manpowerPerBatch(2)));
    expect(input?.requester.fightingStrength).toBe(100);
  });

  // Review finding: after hours at cap the real payout is far below a full window.
  it("uses the simulation's own next payout over the full-window estimate", () => {
    const aiSnapshot = snapshot("ai-1", 50);
    aiSnapshot.player = { ...aiSnapshot.player, nextManpowerBatchAmount: 40 } as typeof aiSnapshot.player;
    const input = buildAiDiplomacyStanceInput({
      aiPlayerId: "ai-1", aiName: "Milo", aiSnapshot, requesterId: "player-2", requesterSnapshot: undefined,
      requesterBrokeTruceWithAi: false, now
    });
    expect(input?.ai.nextRefillManpower).toBe(40);
  });
});

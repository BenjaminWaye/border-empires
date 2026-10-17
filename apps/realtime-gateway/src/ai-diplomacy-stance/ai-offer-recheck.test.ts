import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { AiDiplomacyContext } from "./ai-diplomacy-evaluation.js";
import { recheckAiOffer } from "./ai-offer-recheck.js";

const NOW = 10_000_000;
const AI_ID = "ai-1";
const HUMAN_ID = "human-1";

const context = (memory: Partial<AiDiplomacyContext["memory"]> = {}): AiDiplomacyContext => ({
  requesterBrokeTruceWithAi: false,
  requesterTruceBreaksWithOthers: 0,
  memory: {
    tilesTakenFromAi: 0,
    tilesTakenByAi: 0,
    battles: 0,
    truceDeals: 0,
    goodwillCoin: 0,
    lastPlayerAttackAt: undefined,
    lastCombatAt: undefined,
    aiAlreadyPaidThisWar: false,
    ...memory
  },
  now: NOW,
  alliesOf: () => []
});

// Neighbours (touching borders), evenly matched, AI earns 2 coin/min.
const tiles = [
  { x: 0, y: 0, ownerId: AI_ID },
  { x: 1, y: 0, ownerId: HUMAN_ID }
] as PlayerSubscriptionSnapshot["tiles"];
const snapshotFor = (playerId: string, gold: number, incomePerMinute: number): PlayerSubscriptionSnapshot =>
  ({
    playerId,
    tiles,
    player: { manpower: 800, manpowerCap: 1000, gold, incomePerMinute },
    worldStatus: { leaderboard: { selfOverall: { score: 100 } } }
  }) as unknown as PlayerSubscriptionSnapshot;

// The AI's 12h truce counter: the player pays 12h x 2 coin/min = 1440 coin (Cautious neighbours at peace).
const counterFromAi = { give: { gold: 0, shard: 0 }, ask: { gold: 1440, shard: 0 } };

const recheck = (memory: Partial<AiDiplomacyContext["memory"]>, aiSnapshot: PlayerSubscriptionSnapshot | null = snapshotFor(AI_ID, 0, 2)) =>
  recheckAiOffer(
    {
      fetchAiSnapshot: async () => aiSnapshot ?? undefined,
      requesterSnapshot: async () => snapshotFor(HUMAN_ID, 5_000, 1),
      diplomacyContext: () => context(memory)
    },
    { aiPlayerId: AI_ID, aiName: "Alden Vale", playerId: HUMAN_ID, kind: "truce", durationHours: 12, termsFromAi: counterFromAi }
  );

describe("recheckAiOffer", () => {
  it("stands by its counter-offer while nothing has changed", async () => {
    await expect(recheck({})).resolves.toBeUndefined();
  });

  // The grab-and-truce exploit: ask, get a counter, attack, then accept the old price.
  it("withdraws the counter when the player attacked since", async () => {
    await expect(recheck({ lastPlayerAttackAt: NOW - 5 * 60_000, lastCombatAt: NOW - 5 * 60_000 })).resolves.toEqual({
      reason: "Alden Vale withdrew its offer. You attacked Alden Vale 5 min ago. They won't talk peace yet.",
      withdraw: true
    });
  });

  it("withdraws the counter when its price has gone up since", async () => {
    // 6 tiles taken 8h ago: no longer at war, but reparations and a worse attitude raise the price.
    const result = await recheck({ tilesTakenFromAi: 6, lastPlayerAttackAt: NOW - 8 * 60 * 60_000, lastCombatAt: NOW - 8 * 60 * 60_000 });
    expect(result).toEqual(expect.objectContaining({ withdraw: true }));
    expect(result?.reason).toContain("those terms no longer suit it");
  });

  it("refuses without withdrawing when the AI can't be read right now", async () => {
    await expect(recheck({}, null)).resolves.toEqual(expect.objectContaining({ withdraw: false }));
  });
});

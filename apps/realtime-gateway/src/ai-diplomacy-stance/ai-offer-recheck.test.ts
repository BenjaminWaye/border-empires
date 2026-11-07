import { describe, expect, it, vi } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { AiDiplomacyContext } from "./ai-diplomacy-evaluation.js";
import { recheckAiOffer } from "./ai-offer-recheck.js";

const NOW = 10_000_000;
const AI_ID = "ai-1";
const HUMAN_ID = "human-1";

const context = (memory: Partial<AiDiplomacyContext["memory"]> = {}): AiDiplomacyContext => ({
  requesterBrokeTruceWithAi: false,
  requesterTruceBreaksWithOthers: 0, requesterBrokeAllianceWithAi: false,
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
const counterFromAi = { give: { gold: 0 }, ask: { gold: 1440 } };

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
  // Even an AI willing to deal after an attack wants more than its pre-attack price.
  it("withdraws the counter when the player attacked since", async () => {
    const result = await recheck({ lastPlayerAttackAt: NOW - 5 * 60_000, lastCombatAt: NOW - 5 * 60_000 });
    expect(result).toEqual(expect.objectContaining({ withdraw: true }));
    expect(result?.reason).toContain("those terms no longer suit it");
  });

  it("withdraws the counter when its price has gone up since", async () => {
    // 6 tiles taken 8h ago: no longer at war, but reparations and a worse attitude raise the price.
    const result = await recheck({ tilesTakenFromAi: 6, lastPlayerAttackAt: NOW - 8 * 60 * 60_000, lastCombatAt: NOW - 8 * 60 * 60_000 });
    expect(result).toEqual(expect.objectContaining({ withdraw: true }));
    expect(result?.reason).toContain("those terms no longer suit it");
  });

  // Prices follow live income, so a counter must survive the drift of ordinary growth.
  it("stands by its counter when income has only drifted, not when it has jumped", async () => {
    await expect(recheck({}, snapshotFor(AI_ID, 0, 2.1))).resolves.toBeUndefined();
    await expect(recheck({}, snapshotFor(AI_ID, 0, 3))).resolves.toEqual(expect.objectContaining({ withdraw: true }));
  });

  it("refuses without withdrawing when the AI can't be read right now", async () => {
    await expect(recheck({}, null)).resolves.toEqual(expect.objectContaining({ withdraw: false }));
  });
});

describe("recheckAiOffer on a truce extension", () => {
  // A losing AI (3 tiles down, fighting a minute ago) offered to pay 50 coin for peace.
  const aiPays = { give: { gold: 50 }, ask: { gold: 0 } };
  const recheckPaid = (extendsTruce: boolean) =>
    recheckAiOffer(
      {
        fetchAiSnapshot: async () => snapshotFor(AI_ID, 1_000, 2),
        requesterSnapshot: async () => snapshotFor(HUMAN_ID, 5_000, 1),
        diplomacyContext: () => context({ tilesTakenFromAi: 3, lastCombatAt: NOW - 60_000 })
      },
      { aiPlayerId: AI_ID, aiName: "Alden Vale", playerId: HUMAN_ID, kind: "truce", durationHours: 12, termsFromAi: aiPays, extendsTruce }
    );

  it("stands by paying for a new truce but not for an extension", async () => {
    await expect(recheckPaid(false)).resolves.toBeUndefined();
    await expect(recheckPaid(true)).resolves.toEqual(expect.objectContaining({ withdraw: true }));
  });
});

describe("standing free AI truces", () => {
  it.each([undefined, { give: { gold: 0 }, ask: { gold: 0 } }])(
    "honors a free offer without fetching a new price (%j)",
    async (termsFromAi) => {
      const fetchAiSnapshot = vi.fn(async () => snapshotFor(AI_ID, 0, 200));
      const requesterSnapshot = vi.fn(async () => snapshotFor(HUMAN_ID, 0, 500));
      const diplomacyContext = vi.fn(() => context({ tilesTakenFromAi: 6 }));
      await expect(recheckAiOffer(
        { fetchAiSnapshot, requesterSnapshot, diplomacyContext },
        { aiPlayerId: AI_ID, aiName: "Alden Vale", playerId: HUMAN_ID, kind: "truce", durationHours: 12, termsFromAi }
      )).resolves.toBeUndefined();
      expect(fetchAiSnapshot).not.toHaveBeenCalled();
      expect(requesterSnapshot).not.toHaveBeenCalled();
      expect(diplomacyContext).not.toHaveBeenCalled();
    }
  );

  it("does not mistake a resource supply commitment for a free truce", async () => {
    await expect(recheckAiOffer(
      {
        fetchAiSnapshot: async () => undefined,
        requesterSnapshot: async () => undefined,
        diplomacyContext: () => context()
      },
      { aiPlayerId: AI_ID, aiName: "Alden Vale", playerId: HUMAN_ID, kind: "truce", durationHours: 12,
        termsFromAi: { give: { gold: 0, resources: { FOOD: 1 } }, ask: { gold: 0 } } }
    )).resolves.toEqual(expect.objectContaining({ withdraw: false }));
  });

  it("still checks a free alliance against current alliance eligibility", async () => {
    await expect(recheckAiOffer(
      {
        fetchAiSnapshot: async () => undefined,
        requesterSnapshot: async () => undefined,
        diplomacyContext: () => context()
      },
      { aiPlayerId: AI_ID, aiName: "Alden Vale", playerId: HUMAN_ID, kind: "alliance", durationHours: 12, termsFromAi: undefined }
    )).resolves.toEqual(expect.objectContaining({ withdraw: false }));
  });
});

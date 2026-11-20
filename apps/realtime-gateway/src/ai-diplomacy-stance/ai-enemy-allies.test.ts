import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { createAiDiplomacyMemory } from "../ai-diplomacy-memory/ai-diplomacy-memory.js";
import { AT_WAR_WINDOW_MS } from "./ai-diplomacy-opinion.js";
import { HOUR, memory, NOW } from "./ai-diplomacy-pricing-test-helpers.js";
import { joinNames, requesterAlliesAtWarWithAi } from "./ai-enemy-allies.js";
import { answerDiplomacyStanceQuery } from "./diplomacy-stance-query.js";

const NAMES: Record<string, string> = { "ai-kara": "Kara", "ai-rasmus": "Rasmus", "ai-alden": "Alden", p1: "Strategist" };
const nameOf = (id: string): string => NAMES[id] ?? id;

// Playtest 2026-11-20 (pt-strategist): Kara and Rasmus, the two sides of the
// Chronicle's "Open War", each sold him an alliance for ~10 coin minutes apart.
describe("an AI won't ally with a friend of its enemy", () => {
  const rasmusSnapshot = {
    playerId: "ai-rasmus",
    tiles: [],
    player: { manpower: 800, manpowerCap: 1000, gold: 40, incomePerMinute: 2, strategicResources: {} },
    worldStatus: { leaderboard: { overall: [{ id: "ai-rasmus", tiles: 100 }, { id: "ai-kara", tiles: 60 }, { id: "p1", tiles: 40 }] } }
  } as unknown as PlayerSubscriptionSnapshot;

  /** The trade screen's read of Rasmus for the strategist, already allied with Kara, `sinceFight` after Kara and Rasmus last fought. */
  const rasmusReads = async (sinceFight: number | undefined) => {
    let clock = NOW - (sinceFight ?? 0);
    const aiMemory = createAiDiplomacyMemory({ now: () => clock, isAi: (id) => id.startsWith("ai-") });
    if (sinceFight !== undefined) aiMemory.observeCombat({ attackerId: "ai-kara", defenderId: "ai-rasmus", attackerWon: true, tilesCaptured: 3 });
    clock = NOW;
    const alliesOf = (id: string): readonly string[] => (id === "p1" ? ["ai-kara"] : id === "ai-kara" ? ["p1"] : []);
    return answerDiplomacyStanceQuery({
      resolvePlayerByName: (name: string) => (name === "Rasmus" ? { id: "ai-rasmus", name: "Rasmus" } : undefined),
      isAutoRespondingAi: (id: string) => id.startsWith("ai-"),
      fetchAiSnapshot: async () => rasmusSnapshot,
      requesterSnapshot: async () => undefined,
      diplomacyContext: (requesterId: string, aiPlayerId: string) => ({
        requesterBrokeTruceWithAi: false,
        requesterTruceBreaksWithOthers: 0,
        requesterBrokeAllianceWithAi: false,
        // Rasmus thinks well of the strategist: before this rule the alliance was free.
        memory: memory({ goodwillCoin: 100_000 }),
        now: NOW,
        alliesOf,
        requesterAlliesAtWarWithAi: requesterAlliesAtWarWithAi({ requesterId, aiPlayerId, alliesOf, warMemory: aiMemory.view, nameOf, now: NOW })
      })
    }, "p1", "Rasmus");
  };

  it("prices the alliance as usual while Rasmus isn't at war with Kara", async () => {
    const reply = await rasmusReads(undefined);
    expect(reply).not.toHaveProperty("allianceRefusal");
    expect(reply).toEqual(expect.objectContaining({ pricing: expect.objectContaining({ required: expect.objectContaining({ alliance: 0 }) }) }));
  });

  it("refuses the alliance while Rasmus is at war with Kara, whatever its attitude", async () => {
    const reply = await rasmusReads(HOUR);
    expect(reply).toEqual(expect.objectContaining({ allianceRefusal: "Rasmus won't ally with a friend of Kara while they are at war." }));
    expect(reply).toEqual(expect.objectContaining({ pricing: expect.objectContaining({ required: expect.objectContaining({ alliance: null }) }) }));
  });

  it("leaves truce prices alone", async () => {
    const atPeace = await rasmusReads(undefined);
    const atWar = await rasmusReads(HOUR);
    const truces = (reply: typeof atPeace) => ("pricing" in reply ? { truce12: reply.pricing?.required.truce12, truce24: reply.pricing?.required.truce24 } : undefined);
    expect(truces(atWar)).toEqual(truces(atPeace));
    expect(atWar).not.toHaveProperty("truceRefusal");
  });

  it("deals again once their war has gone quiet past the at-war window", async () => {
    expect(await rasmusReads(AT_WAR_WINDOW_MS + HOUR)).not.toHaveProperty("allianceRefusal");
  });
});

describe("requesterAlliesAtWarWithAi", () => {
  const lastCombatAt: Record<string, number> = { "ai-kara": NOW - HOUR, "ai-alden": NOW - 2 * HOUR, "ai-old": NOW - AT_WAR_WINDOW_MS - 1 };
  const read = (allies: readonly string[]) =>
    requesterAlliesAtWarWithAi({
      requesterId: "p1",
      aiPlayerId: "ai-rasmus",
      alliesOf: () => allies,
      warMemory: (_ai, other) => ({ lastCombatAt: lastCombatAt[other] }),
      nameOf,
      now: NOW
    });

  it("names every ally the AI fought in either direction within the at-war window, and no one else", () => {
    expect(read(["ai-kara", "ai-old", "ai-calm", "ai-alden"])).toEqual(["Kara", "Alden"]);
    expect(read(["ai-rasmus"])).toEqual([]);
  });

  it("joins names for the refusal", () => {
    expect(joinNames(["Kara"])).toBe("Kara");
    expect(joinNames(["Kara", "Alden"])).toBe("Kara and Alden");
    expect(joinNames(["Kara", "Alden", "Mira"])).toBe("Kara, Alden and Mira");
  });
});

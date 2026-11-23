import { describe, expect, it, vi } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { AiDiplomacyContext } from "../ai-diplomacy-stance/ai-diplomacy-evaluation.js";
import { requesterAlliesAtWarWithAi } from "../ai-diplomacy-stance/ai-enemy-allies.js";
import { createKeyedSerialQueue } from "./keyed-serial-queue.js";
import { createSeededAiDiplomacyResponder } from "./seeded-ai-diplomacy-responder.js";

const NOW = 10_000_000;
const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Review of PR #2900: the strategist sends alliance offers to Kara and Rasmus,
// at war with each other, in the same second. Each answer awaits snapshots and
// the season board before accepting, so both were judged before either
// alliance existed and both accepted.
describe("AI alliance answers race", () => {
  it("answers one requester's alliance offers in turn, so the second AI sees the first alliance", async () => {
    const allies = new Map<string, Set<string>>([["p1", new Set()], ["ai-kara", new Set()], ["ai-rasmus", new Set()]]);
    const alliesOf = (id: string): readonly string[] => [...(allies.get(id) ?? [])];
    const names: Record<string, string> = { "ai-kara": "Kara", "ai-rasmus": "Rasmus" };
    const snapshot = (id: string) => ({
      playerId: id, tiles: [],
      player: { manpower: 800, manpowerCap: 1000, gold: 0, incomePerMinute: 1 },
      worldStatus: { leaderboard: { selfOverall: { score: 100 }, overall: [{ id, tiles: 100 }, { id: "p1", tiles: 30 }] } }
    }) as unknown as PlayerSubscriptionSnapshot;
    const context = async (requesterId: string, aiPlayerId: string): Promise<AiDiplomacyContext> => {
      const requesterAllies = requesterAlliesAtWarWithAi({
        requesterId, aiPlayerId, alliesOf,
        // Kara and Rasmus fought an hour ago.
        warMemory: (_ai, other) => ({ lastCombatAt: other.startsWith("ai-") ? NOW - 60 * 60_000 : undefined }),
        nameOf: (id) => names[id] ?? id, now: NOW
      });
      await tick(5); // the season board and returnable-town reads
      return {
        requesterBrokeTruceWithAi: false, requesterTruceBreaksWithOthers: 0, requesterBrokeAllianceWithAi: false,
        memory: { tilesTakenFromAi: 0, tilesTakenByAi: 0, battles: 0, truceDeals: 0, goodwillCoin: 100_000, lastPlayerAttackAt: undefined, lastCombatAt: undefined, aiAlreadyPaidThisWar: false },
        now: NOW, alliesOf, requesterAlliesAtWarWithAi: requesterAllies
      };
    };
    const ok = () => ({ ok: true as const, notifyPlayerIds: [], payloadsByPlayerId: new Map<string, unknown[]>() });
    const acceptAlliance = vi.fn(async (aiId: string) => {
      await tick(5);
      allies.get(aiId)?.add("p1");
      allies.get("p1")?.add(aiId);
      return ok();
    });
    const rejectAlliance = vi.fn(() => ok());
    const responder = createSeededAiDiplomacyResponder({
      seededAiPlayerIds: new Set(["ai-kara", "ai-rasmus"]),
      fetchPlayerSnapshot: async (id: string) => snapshot(id),
      requesterSnapshot: async () => undefined,
      diplomacyContext: context,
      hasLiveSocket: () => false,
      acceptTruce: vi.fn(), rejectTruce: vi.fn(), acceptAlliance, rejectAlliance, requestTruce: vi.fn(), requestAlliance: vi.fn(),
      syncPlayers: () => ({ payloadsByPlayerId: new Map() }),
      fanoutPlayerPayloads: () => {},
      recordGatewayEvent: () => {},
      syncTruceToSimulation: vi.fn(),
      syncAllianceToSimulation: vi.fn().mockResolvedValue(true)
    });

    await Promise.all([
      responder.maybeAutoRespondToSeededAiAlliance({ id: "a1", fromPlayerId: "p1", toPlayerId: "ai-kara", createdAt: 0, fromName: "P1", toName: "Kara" }),
      responder.maybeAutoRespondToSeededAiAlliance({ id: "a2", fromPlayerId: "p1", toPlayerId: "ai-rasmus", createdAt: 0, fromName: "P1", toName: "Rasmus" })
    ]);

    expect(acceptAlliance).toHaveBeenCalledTimes(1);
    expect(acceptAlliance).toHaveBeenCalledWith("ai-kara", "a1", expect.anything());
    expect(rejectAlliance).toHaveBeenCalledWith("ai-rasmus", "a2", expect.objectContaining({
      announcementByPlayerId: expect.objectContaining({ p1: expect.stringContaining("Rasmus is at war with Kara and won't ally with a friend of theirs.") })
    }));
  });
});

describe("createKeyedSerialQueue", () => {
  it("runs one key's tasks in order, other keys alongside, and keeps going after a failure", async () => {
    const queue = createKeyedSerialQueue();
    const log: string[] = [];
    const task = (label: string, ms: number, fail = false) => async () => {
      log.push(`start ${label}`);
      await tick(ms);
      log.push(`end ${label}`);
      if (fail) throw new Error(label);
    };
    const results = await Promise.allSettled([queue("a", task("a1", 10, true)), queue("a", task("a2", 1)), queue("b", task("b1", 1))]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
    expect(log.indexOf("start a2")).toBeGreaterThan(log.indexOf("end a1"));
    expect(log.indexOf("start b1")).toBeLessThan(log.indexOf("end a1"));
  });
});

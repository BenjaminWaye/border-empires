import { describe, expect, it, vi } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { aiWouldLeadAlliance, alliancesAiShouldLeave, allianceBloc, largestOtherMember } from "./ai-alliance-bloc.js";
import { createAiAllianceReview, AI_ALLIANCE_REVIEW_INTERVAL_MS } from "./ai-alliance-review.js";

const graph = (edges: Array<[string, string]>) => (playerId: string): string[] =>
  edges.flatMap(([a, b]) => (a === playerId ? [b] : b === playerId ? [a] : []));
const sizes = (tiles: Record<string, number>) => (playerId: string): number => tiles[playerId] ?? 0;

describe("alliance blocs", () => {
  it("follows alliances transitively", () => {
    expect([...allianceBloc("a", graph([["a", "b"], ["b", "c"], ["d", "e"]]))].sort()).toEqual(["a", "b", "c"]);
  });

  it("compares the AI against everyone in the merged bloc, not just the requester", () => {
    const alliesOf = graph([["human", "big-friend"]]);
    expect(largestOtherMember("ai", "human", alliesOf, sizes({ ai: 100, human: 50, "big-friend": 95 }))).toEqual({ playerId: "big-friend", tiles: 95 });
    expect(aiWouldLeadAlliance("ai", "human", alliesOf, sizes({ ai: 100, human: 50, "big-friend": 95 }))).toBe(false);
    expect(aiWouldLeadAlliance("ai", "human", alliesOf, sizes({ ai: 120, human: 50, "big-friend": 95 }))).toBe(true);
  });

  it("needs a clear lead to join, so small swings don't flip alliances", () => {
    expect(aiWouldLeadAlliance("ai", "human", graph([]), sizes({ ai: 105, human: 100 }))).toBe(false);
    expect(aiWouldLeadAlliance("ai", "human", graph([]), sizes({ ai: 110, human: 100 }))).toBe(true);
  });

  it("leaves only the allies through whom a larger empire is reached", () => {
    const alliesOf = graph([["ai", "small"], ["ai", "grown"], ["ai", "bridge"], ["bridge", "giant"]]);
    expect(alliancesAiShouldLeave("ai", alliesOf, sizes({ ai: 100, small: 40, grown: 100, bridge: 30, giant: 150 })).sort()).toEqual(["bridge", "grown"]);
  });
});

describe("createAiAllianceReview", () => {
  const snapshot = (tiles: Record<string, number>) =>
    ({ playerId: "ai-1", tiles: [], worldStatus: { leaderboard: { overall: Object.entries(tiles).map(([id, count]) => ({ id, name: id, tiles: count })) } } }) as unknown as PlayerSubscriptionSnapshot;

  const setup = (tiles: Record<string, number>, pending: string[] = []) => {
    const clock = { now: 0 };
    const breakAlliance = vi.fn().mockReturnValue({ ok: true, payloadsByPlayerId: new Map() });
    const review = createAiAllianceReview({
      seededAiPlayerIds: new Set(["ai-1"]),
      hasLiveSocket: () => false,
      alliesOf: graph([["ai-1", "human"]]),
      pendingBreaksOf: () => pending,
      fetchAiSnapshot: async () => snapshot(tiles),
      playerName: (id) => (id === "ai-1" ? "Milo" : "Beejac"),
      breakAlliance,
      fanoutPlayerPayloads: () => undefined,
      recordGatewayEvent: () => undefined,
      now: () => clock.now
    });
    return { review, breakAlliance, clock };
  };

  it("gives notice to an ally that has outgrown the AI, explaining why", async () => {
    const { review, breakAlliance } = setup({ "ai-1": 100, human: 120 });
    await review();
    expect(breakAlliance).toHaveBeenCalledWith("ai-1", "human", {
      human: "Milo started a 24h notice to leave your alliance: it is no longer the alliance's largest empire, and won't help a larger partner win Diplomatic Dominance.",
      "ai-1": "You started a 24h notice to leave your alliance with Beejac."
    });
  });

  it("stays while it leads, skips allies already given notice, and runs at most every few minutes", async () => {
    const leading = setup({ "ai-1": 200, human: 120 });
    await leading.review();
    expect(leading.breakAlliance).not.toHaveBeenCalled();

    const noticed = setup({ "ai-1": 100, human: 120 }, ["human"]);
    await noticed.review();
    expect(noticed.breakAlliance).not.toHaveBeenCalled();

    const throttled = setup({ "ai-1": 200, human: 120 });
    await throttled.review();
    throttled.clock.now += AI_ALLIANCE_REVIEW_INTERVAL_MS - 1;
    await throttled.review();
    expect(throttled.breakAlliance).not.toHaveBeenCalled();
  });
});

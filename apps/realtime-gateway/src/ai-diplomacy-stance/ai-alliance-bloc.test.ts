import { describe, expect, it, vi } from "vitest";

import { aiWouldLeadAlliance, alliancesAiShouldLeave, allianceBloc, largestOtherMember, tileLookupFor } from "./ai-alliance-bloc.js";
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

  it("only vouches for sizes when the leaderboard lists the AI", () => {
    expect(tileLookupFor([], "ai")).toBeUndefined();
    expect(tileLookupFor([{ id: "human", tiles: 40 }], "ai")).toBeUndefined();
    const tilesOf = tileLookupFor([{ id: "ai", tiles: 100 }, { id: "human", tiles: 40 }], "ai");
    expect([tilesOf?.("ai"), tilesOf?.("human"), tilesOf?.("inactive")]).toEqual([100, 40, 0]);
  });

  it("leaves only the allies through whom a larger empire is reached", () => {
    const alliesOf = graph([["ai", "small"], ["ai", "grown"], ["ai", "bridge"], ["bridge", "giant"]]);
    expect(alliancesAiShouldLeave("ai", alliesOf, sizes({ ai: 100, small: 40, grown: 100, bridge: 30, giant: 150 })).sort()).toEqual(["bridge", "grown"]);
  });
});

describe("createAiAllianceReview", () => {
  const leaderboard = (tiles: Record<string, number>) => Object.entries(tiles).map(([id, count]) => ({ id, tiles: count }));

  const setup = (tiles: Record<string, number>, pending: string[] = [], ais = ["ai-1"], edges: Array<[string, string]> = [["ai-1", "human"]]) => {
    const clock = { now: 0 };
    const breakAlliance = vi.fn().mockReturnValue({ ok: true, payloadsByPlayerId: new Map() });
    const fetchLeaderboard = vi.fn(async () => leaderboard(tiles));
    const review = createAiAllianceReview({
      seededAiPlayerIds: new Set(ais),
      hasLiveSocket: () => false,
      alliesOf: graph(edges),
      pendingBreaksOf: () => pending,
      fetchLeaderboard,
      playerName: (id) => (id === "ai-1" ? "Milo" : "Beejac"),
      breakAlliance,
      fanoutPlayerPayloads: () => undefined,
      recordGatewayEvent: () => undefined,
      now: () => clock.now
    });
    return { review, breakAlliance, clock, fetchLeaderboard };
  };

  // One cached season-summary read per run, never a subscription as each AI.
  it("reads the leaderboard once per run, however many AIs it checks", async () => {
    const { review, breakAlliance, fetchLeaderboard } = setup({ "ai-1": 100, "ai-2": 100, human: 120 }, [], ["ai-1", "ai-2"], [["ai-1", "human"], ["ai-2", "human"]]);
    await review();
    expect(fetchLeaderboard).toHaveBeenCalledTimes(1);
    expect(breakAlliance).toHaveBeenCalledTimes(2);
  });

  // An AI missing from the leaderboard would otherwise count as 0 tiles and leave every alliance.
  it("doesn't leave on a guess when the leaderboard has no size for the AI", async () => {
    for (const tiles of [{}, { human: 120 }]) {
      const { review, breakAlliance } = setup(tiles);
      await review();
      expect(breakAlliance).not.toHaveBeenCalled();
    }
  });

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

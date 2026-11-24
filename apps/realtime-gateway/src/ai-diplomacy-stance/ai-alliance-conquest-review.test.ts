import { describe, expect, it, vi } from "vitest";

import { weakNeighboursToLeave } from "./ai-alliance-conquest-review.js";
import { AI_ALLIANCE_REVIEW_INTERVAL_MS, AI_WEAK_NEIGHBOUR_RECHECK_MS, createAiAllianceReview } from "./ai-alliance-review.js";
import { canOpenAnotherFront, warFrontsInView } from "./ai-war-fronts.js";

const tile = (x: number, y: number, ownerId: string, extra: { townJson?: string; fortJson?: string } = {}) => ({ x, y, ownerId, musterJson: undefined, ...extra });
// AI at x=0, weak ally at x=1 with an unfortified town at x=2, a rival at war on the AI's other side (x=-1).
const exposed = [tile(0, 0, "ai"), tile(1, 0, "ally"), tile(2, 0, "ally", { townJson: "{}" })];
const withRival = [...exposed, tile(-1, 0, "rival")];
const sizes = (tiles: Record<string, number>) => (playerId: string): number => tiles[playerId] ?? 0;
const army = (manpower: number) => ({ manpower, manpowerCap: 100 });

describe("war fronts", () => {
  it("counts bordering empires the AI is at war with, not barbarians or the neighbour being weighed", () => {
    const tiles = [...withRival, tile(0, 1, "barbarian-1"), tile(0, -1, "peaceful")];
    expect(warFrontsInView(tiles, "ai", (id) => id !== "peaceful")).toBe(2); // rival + ally
    expect(warFrontsInView(tiles, "ai", (id) => id !== "peaceful", "ally")).toBe(1);
  });

  it("needs a quarter of the manpower cap per front, the new one included", () => {
    expect(canOpenAnotherFront(25, 100, 0)).toBe(true);
    expect(canOpenAnotherFront(49, 100, 1)).toBe(false);
    expect(canOpenAnotherFront(50, 100, 1)).toBe(true);
    expect(canOpenAnotherFront(100, 0, 0)).toBe(false);
  });
});

describe("weakNeighboursToLeave", () => {
  const tilesOf = sizes({ ai: 100, ally: 40 });

  it("leaves a weak neighbour that exposed a town again, when its army can cover the war", () => {
    expect(weakNeighboursToLeave("ai", ["ally"], tilesOf, { tiles: exposed, player: army(30) }, () => false)).toEqual(["ally"]);
  });

  it("stays when the town is fortified, the ally isn't much smaller, or there's no army reading", () => {
    const fortified = [...exposed, tile(3, 0, "ally", { fortJson: "{}" })];
    expect(weakNeighboursToLeave("ai", ["ally"], tilesOf, { tiles: fortified, player: army(30) }, () => false)).toEqual([]);
    expect(weakNeighboursToLeave("ai", ["ally"], sizes({ ai: 100, ally: 80 }), { tiles: exposed, player: army(30) }, () => false)).toEqual([]);
    expect(weakNeighboursToLeave("ai", ["ally"], tilesOf, { tiles: exposed }, () => false)).toEqual([]);
  });

  it("stays when the wars it already fights leave no army for one more front", () => {
    const atWar = (id: string) => id === "rival";
    expect(weakNeighboursToLeave("ai", ["ally"], tilesOf, { tiles: withRival, player: army(30) }, atWar)).toEqual([]);
    expect(weakNeighboursToLeave("ai", ["ally"], tilesOf, { tiles: withRival, player: army(50) }, atWar)).toEqual(["ally"]);
  });
});

describe("weak-neighbour re-check in the alliance review", () => {
  const setup = (ais: string[]) => {
    const clock = { now: 0 };
    const breakAlliance = vi.fn().mockReturnValue({ ok: true, payloadsByPlayerId: new Map() });
    const fetchAiView = vi.fn(async (aiId: string) => ({ tiles: exposed.map((t) => (t.ownerId === "ai" ? { ...t, ownerId: aiId } : t)), player: army(30) }));
    const review = createAiAllianceReview({
      seededAiPlayerIds: new Set(ais),
      hasLiveSocket: () => false,
      alliesOf: (id) => (ais.includes(id) ? ["ally"] : id === "ally" ? ais : []),
      pendingBreaksOf: () => [],
      fetchLeaderboard: async () => ({ tiles: [...ais.map((id) => ({ id, tiles: 100 })), { id: "ally", tiles: 40 }] }),
      playerName: (id) => id,
      breakAlliance,
      fanoutPlayerPayloads: () => undefined,
      recordGatewayEvent: () => undefined,
      now: () => clock.now,
      fetchAiView,
      atWarWith: () => false
    });
    return { clock, review, breakAlliance, fetchAiView };
  };

  it("gives notice with a reason the ally can act on", async () => {
    const { review, breakAlliance } = setup(["ai"]);
    await review();
    expect(breakAlliance).toHaveBeenCalledWith("ai", "ally", expect.objectContaining({
      ally: "ai started a 24h notice to leave your alliance: it would rather take your land. Fortify the towns and resources on your border with them to keep the alliance."
    }));
  });

  it("exports one AI view per run and re-checks each AI at most every 4 hours", async () => {
    const { clock, review, fetchAiView } = setup(["ai-1", "ai-2"]);
    await review();
    clock.now += AI_ALLIANCE_REVIEW_INTERVAL_MS;
    await review();
    expect(fetchAiView.mock.calls.map(([id]) => id)).toEqual(["ai-1", "ai-2"]);
    clock.now += AI_ALLIANCE_REVIEW_INTERVAL_MS;
    await review(); // both checked within 4h: no export
    expect(fetchAiView).toHaveBeenCalledTimes(2);
    clock.now = AI_WEAK_NEIGHBOUR_RECHECK_MS;
    await review();
    expect(fetchAiView.mock.calls.map(([id]) => id)).toEqual(["ai-1", "ai-2", "ai-1"]);
  });
});

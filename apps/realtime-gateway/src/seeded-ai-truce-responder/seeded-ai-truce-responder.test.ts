import { describe, expect, it, vi } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { createSeededAiTruceResponder, memoizeWithTtl } from "./seeded-ai-truce-responder.js";
import type { SocialTruceRequest } from "../social-state/social-state.js";

const AI_ID = "ai-1";
const HUMAN_ID = "human-1";

const baseRequest: SocialTruceRequest = {
  id: "req-1",
  fromPlayerId: HUMAN_ID,
  toPlayerId: AI_ID,
  createdAt: 0,
  expiresAt: 999_999,
  durationHours: 24,
  fromName: "Human",
  toName: "Alden Vale"
};

const snapshotWithManpower = (manpower: number, manpowerCap: number): PlayerSubscriptionSnapshot =>
  ({ playerId: AI_ID, tiles: [], player: { manpower, manpowerCap } }) as PlayerSubscriptionSnapshot;

const makeDeps = (snapshot: PlayerSubscriptionSnapshot | undefined) => {
  const acceptTruce = vi.fn().mockReturnValue({ ok: true, notifyPlayerIds: [HUMAN_ID, AI_ID], payloadsByPlayerId: new Map() });
  const rejectTruce = vi.fn().mockReturnValue({ ok: true, notifyPlayerIds: [HUMAN_ID, AI_ID], payloadsByPlayerId: new Map() });
  return {
    deps: {
      seededAiPlayerIds: new Set([AI_ID]),
      seedPlayers: new Map(),
      fetchPlayerSnapshot: async (playerId: string) => (playerId === AI_ID ? snapshot : undefined),
      hasLiveSocket: () => false,
      acceptTruce,
      rejectTruce,
      syncPlayers: () => ({ payloadsByPlayerId: new Map() }),
      fanoutPlayerPayloads: () => {},
      recordGatewayEvent: () => {},
      syncTruceToSimulation: vi.fn().mockResolvedValue(true)
    },
    acceptTruce,
    rejectTruce
  };
};

describe("seededAiTruceDecisionFromManpower (via createSeededAiTruceResponder)", () => {
  it("rejects while the AI still has plenty of manpower to keep fighting", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshotWithManpower(800, 1000));

    const { maybeAutoRespondToSeededAiTruce } = createSeededAiTruceResponder(deps);
    await maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(rejectTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id, expect.anything());
    expect(acceptTruce).not.toHaveBeenCalled();
  });

  it("accepts once manpower drops to 20% of cap or below", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshotWithManpower(150, 1000));

    const { maybeAutoRespondToSeededAiTruce } = createSeededAiTruceResponder(deps);
    await maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id);
    expect(rejectTruce).not.toHaveBeenCalled();
  });

  it("accepts when the AI is entirely out of manpower", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshotWithManpower(0, 1000));

    const { maybeAutoRespondToSeededAiTruce } = createSeededAiTruceResponder(deps);
    await maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id);
    expect(rejectTruce).not.toHaveBeenCalled();
  });

  // Regression: no manpower/manpowerCap data at all (e.g. a display-only
  // seasonal AI identity with no backing simulation player) must default to
  // "keep fighting", not "accept" -- manpowerCap<=0 means missing data, not
  // a literal zero-capacity AI.
  it("rejects when no manpower data is available at all", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(undefined);

    const { maybeAutoRespondToSeededAiTruce } = createSeededAiTruceResponder(deps);
    await maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(rejectTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id, expect.anything());
    expect(acceptTruce).not.toHaveBeenCalled();
  });

  // Regression: a seeded-AI identity claimed by a live human socket must not
  // have its truce decisions overridden by the auto-responder -- the human
  // decides for themselves via their own TRUCE_ACCEPT/TRUCE_REJECT.
  it("does not auto-respond once the AI identity has a live human socket", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshotWithManpower(0, 1000));
    deps.hasLiveSocket = () => true;

    const { maybeAutoRespondToSeededAiTruce } = createSeededAiTruceResponder(deps);
    await maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).not.toHaveBeenCalled();
    expect(rejectTruce).not.toHaveBeenCalled();
  });

  // Regression: fetchPlayerSnapshot awaits a real round trip, wide enough
  // for a human to claim the AI identity (attach a live socket) mid-flight.
  // hasLiveSocket must be re-checked after that await, not just before it.
  it("does not auto-respond if a live socket appears while fetchPlayerSnapshot is in flight", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshotWithManpower(0, 1000));
    let liveSocketAppeared = false;
    deps.hasLiveSocket = () => liveSocketAppeared;
    deps.fetchPlayerSnapshot = async (playerId: string) => {
      liveSocketAppeared = true;
      return playerId === AI_ID ? snapshotWithManpower(0, 1000) : undefined;
    };

    const { maybeAutoRespondToSeededAiTruce } = createSeededAiTruceResponder(deps);
    await maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).not.toHaveBeenCalled();
    expect(rejectTruce).not.toHaveBeenCalled();
  });

  // Regression: a live snapshot with a manpower reading but no cap (or a
  // seed-only fallback, which never carries a cap at all) must fall back to
  // a real baseline cap, not silently degrade to "always reject."
  it("falls back to the shared base manpower cap when the snapshot carries manpower but no cap", async () => {
    const snapshot = { playerId: AI_ID, tiles: [], player: { manpower: 10 } } as unknown as PlayerSubscriptionSnapshot;
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshot);

    const { maybeAutoRespondToSeededAiTruce } = createSeededAiTruceResponder(deps);
    await maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id);
    expect(rejectTruce).not.toHaveBeenCalled();
  });
});

describe("memoizeWithTtl", () => {
  it("collapses repeated calls for the same key within the TTL window into one underlying call", async () => {
    const underlying = vi.fn(async (key: string) => `value:${key}`);
    const memoized = memoizeWithTtl(underlying, 3_000);

    expect(await memoized("ai-1")).toBe("value:ai-1");
    expect(await memoized("ai-1")).toBe("value:ai-1");
    expect(await memoized("ai-1")).toBe("value:ai-1");

    expect(underlying).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the TTL expires", async () => {
    vi.useFakeTimers();
    try {
      const underlying = vi.fn(async (key: string) => `value:${key}:${Date.now()}`);
      const memoized = memoizeWithTtl(underlying, 1_000);

      await memoized("ai-1");
      vi.advanceTimersByTime(1_001);
      await memoized("ai-1");

      expect(underlying).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caches each key independently", async () => {
    const underlying = vi.fn(async (key: string) => `value:${key}`);
    const memoized = memoizeWithTtl(underlying, 3_000);

    await memoized("ai-1");
    await memoized("ai-2");
    await memoized("ai-1");

    expect(underlying).toHaveBeenCalledTimes(2);
  });
});

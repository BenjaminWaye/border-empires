import { describe, expect, it, vi } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { aiDiplomacyAnnouncements, createSeededAiDiplomacyResponder, memoizeWithTtl } from "./seeded-ai-diplomacy-responder.js";
import type { SocialAllianceRequest, SocialTruceRequest } from "../social-state/social-state.js";
import type { AiDiplomacyContext } from "../ai-diplomacy-stance/ai-diplomacy-evaluation.js";

const NOW = 10_000_000;
const quietContext = (overrides: Partial<AiDiplomacyContext["memory"]> = {}, context: Partial<AiDiplomacyContext> = {}): AiDiplomacyContext => ({
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
    ...overrides
  },
  now: NOW,
  alliesOf: () => [],
  ...context
});

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

const allianceRequest: SocialAllianceRequest = { id: "alliance-1", fromPlayerId: HUMAN_ID, toPlayerId: AI_ID, createdAt: 0, fromName: "Human", toName: "Alden Vale" };

type SnapshotOptions = {
  manpower: number;
  manpowerCap?: number;
  score?: number;
  gold?: number;
  incomePerMinute?: number;
  tiles?: PlayerSubscriptionSnapshot["tiles"];
  /** Leaderboard tile counts by player id (the alliance bloc-lead check reads these). */
  leaderboardTiles?: Record<string, number>;
};

const snapshotFor = (playerId: string, options: SnapshotOptions): PlayerSubscriptionSnapshot =>
  ({
    playerId,
    tiles: options.tiles ?? [],
    player: {
      manpower: options.manpower,
      gold: options.gold ?? 0,
      incomePerMinute: options.incomePerMinute ?? 1,
      ...(options.manpowerCap !== undefined ? { manpowerCap: options.manpowerCap } : {})
    },
    ...(options.score !== undefined
      ? {
          worldStatus: {
            leaderboard: {
              selfOverall: { score: options.score },
              overall: Object.entries(options.leaderboardTiles ?? {}).map(([id, tiles]) => ({ id, tiles }))
            }
          }
        }
      : {})
  }) as unknown as PlayerSubscriptionSnapshot;

// AI at (0,0) and the human at (1,0): their borders touch.
const touchingTiles = [
  { x: 0, y: 0, ownerId: AI_ID },
  { x: 1, y: 0, ownerId: HUMAN_ID }
] as PlayerSubscriptionSnapshot["tiles"];

const okResult = () => ({ ok: true as const, notifyPlayerIds: [HUMAN_ID, AI_ID], payloadsByPlayerId: new Map<string, unknown[]>() });

const makeDeps = (aiSnapshot: PlayerSubscriptionSnapshot | undefined, requesterSnapshot?: PlayerSubscriptionSnapshot, context = quietContext()) => {
  const acceptTruce = vi.fn().mockResolvedValue(okResult());
  const rejectTruce = vi.fn().mockReturnValue(okResult());
  const acceptAlliance = vi.fn().mockResolvedValue(okResult());
  const requestTruce = vi.fn().mockReturnValue(okResult());
  const requestAlliance = vi.fn().mockReturnValue(okResult());
  const rejectAlliance = vi.fn().mockReturnValue(okResult());
  const syncAllianceToSimulation = vi.fn().mockResolvedValue(true);
  const syncTruceToSimulation = vi.fn().mockResolvedValue(true);
  return {
    deps: {
      seededAiPlayerIds: new Set([AI_ID]),
      fetchPlayerSnapshot: async (playerId: string) => (playerId === AI_ID ? aiSnapshot : undefined),
      requesterSnapshot: async () => requesterSnapshot,
      diplomacyContext: () => context,
      hasLiveSocket: () => false,
      acceptTruce,
      rejectTruce,
      acceptAlliance,
      rejectAlliance,
      requestTruce,
      requestAlliance,
      syncPlayers: () => ({ payloadsByPlayerId: new Map() }),
      fanoutPlayerPayloads: () => {},
      recordGatewayEvent: () => {},
      syncTruceToSimulation,
      syncAllianceToSimulation
    },
    acceptTruce,
    rejectTruce,
    acceptAlliance,
    rejectAlliance,
    requestTruce,
    requestAlliance,
    syncTruceToSimulation,
    syncAllianceToSimulation
  };
};

describe("createSeededAiDiplomacyResponder truce offers", () => {
  // The AI only asks for what the requester actually holds: with nothing to
  // pay, it declines and says how far short they are instead of naming a price.
  it("declines naming the shortfall when an evenly matched neighbour can't pay its price", async () => {
    const { deps, acceptTruce, rejectTruce, requestTruce } = makeDeps(
      snapshotFor(AI_ID, { manpower: 800, manpowerCap: 1000, score: 100, incomePerMinute: 2, tiles: touchingTiles }),
      snapshotFor(HUMAN_ID, { manpower: 800, manpowerCap: 1000, score: 100, gold: 10 })
    );

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).not.toHaveBeenCalled();
    expect(requestTruce).not.toHaveBeenCalled();
    // Neighbours at peace, Cautious: 12h x 1.5 for a 24h truce = 18h of 2 coin/min = 2160; the requester holds 10.
    expect(rejectTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id, {
      announcementByPlayerId: {
        [HUMAN_ID]:
          "Alden Vale declined your 24h truce offer. Alden Vale is wary of you and won't lower their guard on a contested border. Alden Vale wants about 2150 coin more than you can offer.",
        [AI_ID]: "You declined Human's 24h truce offer."
      },
      startCooldown: true
    });
  });

  it("counter-offers with a price the requester can pay", async () => {
    const { deps, rejectTruce, requestTruce } = makeDeps(
      snapshotFor(AI_ID, { manpower: 800, manpowerCap: 1000, score: 100, incomePerMinute: 2, tiles: touchingTiles }),
      snapshotFor(HUMAN_ID, { manpower: 800, manpowerCap: 1000, score: 100, gold: 5000 })
    );

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(rejectTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id, expect.objectContaining({ startCooldown: true }));
    // From the AI's side: it gives nothing and asks the requester for 2160 coin.
    expect(requestTruce).toHaveBeenCalledWith(AI_ID, "Human", 24, {
      targetPlayerId: HUMAN_ID,
      terms: { give: { gold: 0, shard: 0 }, ask: { gold: 2160, shard: 0 } }
    });
  });

  it("accepts a truce whose offered coin covers the AI's price", async () => {
    const { deps, acceptTruce, requestTruce } = makeDeps(
      snapshotFor(AI_ID, { manpower: 800, manpowerCap: 1000, score: 100, incomePerMinute: 2, tiles: touchingTiles }),
      snapshotFor(HUMAN_ID, { manpower: 800, manpowerCap: 1000, score: 100, gold: 5000 })
    );

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce({
      ...baseRequest,
      terms: { give: { gold: 2160, shard: 0 }, ask: { gold: 0, shard: 0 } }
    });

    expect(acceptTruce).toHaveBeenCalled();
    expect(requestTruce).not.toHaveBeenCalled();
  });

  it("turns a failed payment into a decline without a cooldown", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(
      snapshotFor(AI_ID, { manpower: 800, manpowerCap: 1000, score: 100, incomePerMinute: 2, tiles: touchingTiles }),
      snapshotFor(HUMAN_ID, { manpower: 800, manpowerCap: 1000, score: 100, gold: 5000 })
    );
    acceptTruce.mockResolvedValue({ ok: false, code: "DIPLOMACY_SETTLEMENT_FAILED", message: "The deal fell through: Human no longer has 2160 coin." });

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce({
      ...baseRequest,
      terms: { give: { gold: 2160, shard: 0 }, ask: { gold: 0, shard: 0 } }
    });

    expect(rejectTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id, {
      announcementByPlayerId: expect.objectContaining({
        [HUMAN_ID]: "Alden Vale declined your 24h truce offer. The deal fell through: Human no longer has 2160 coin."
      }),
      startCooldown: false
    });
  });

  it("accepts with a reason and syncs the truce to the simulation once the AI's armies are spent", async () => {
    const { deps, acceptTruce, rejectTruce, syncTruceToSimulation } = makeDeps(
      snapshotFor(AI_ID, { manpower: 150, manpowerCap: 1000, score: 100, tiles: touchingTiles })
    );

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(rejectTruce).not.toHaveBeenCalled();
    expect(acceptTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id, {
      [HUMAN_ID]: "Alden Vale accepted your 24h truce. Alden Vale is looking for peace: their armies are spent.",
      [AI_ID]: "You accepted Human's 24h truce."
    });
    expect(syncTruceToSimulation).toHaveBeenCalledWith({ playerId: AI_ID, targetPlayerId: HUMAN_ID, truced: true });
  });

  // Regression: the old rule read only the free manpower pool, which muster
  // flags drain, so an AI massing an attack looked exhausted and accepted.
  it("declines while most of the AI's manpower sits in its own muster flags", async () => {
    const tiles = [
      ...touchingTiles,
      { x: 0, y: 1, ownerId: AI_ID, musterJson: JSON.stringify({ ownerId: AI_ID, amount: 700, mode: "HOLD", updatedAt: 0 }) }
    ] as PlayerSubscriptionSnapshot["tiles"];
    const { deps, acceptTruce, rejectTruce } = makeDeps(
      snapshotFor(AI_ID, { manpower: 50, manpowerCap: 1000, score: 100, tiles }),
      snapshotFor(HUMAN_ID, { manpower: 800, manpowerCap: 1000, score: 100 })
    );

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).not.toHaveBeenCalled();
    expect(rejectTruce).toHaveBeenCalled();
  });

  // No snapshot at all (e.g. the sim round trip failed) must decline rather
  // than guess -- and without starting a re-offer cooldown, since the
  // player did nothing wrong.
  it("declines without a cooldown when no AI snapshot is available", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(undefined);

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).not.toHaveBeenCalled();
    expect(rejectTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id, expect.objectContaining({ startCooldown: false }));
  });

  // Regression: a live snapshot with a manpower reading but no cap must fall
  // back to the shared base cap, not treat the AI as having zero capacity.
  it("falls back to the shared base manpower cap when the snapshot carries manpower but no cap", async () => {
    const { deps, acceptTruce } = makeDeps(snapshotFor(AI_ID, { manpower: 10, tiles: touchingTiles }));

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).toHaveBeenCalled();
  });

  // Regression: a seeded-AI identity claimed by a live human socket must not
  // have its decisions overridden by the auto-responder.
  it("does not auto-respond once the AI identity has a live human socket", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshotFor(AI_ID, { manpower: 0, manpowerCap: 1000 }));
    deps.hasLiveSocket = () => true;

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).not.toHaveBeenCalled();
    expect(rejectTruce).not.toHaveBeenCalled();
  });

  // Regression: hasLiveSocket must be re-checked after the snapshot fetch,
  // which is wide enough for a human to claim the AI identity mid-flight.
  it("does not auto-respond if a live socket appears while the snapshot fetch is in flight", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(undefined);
    let liveSocketAppeared = false;
    deps.hasLiveSocket = () => liveSocketAppeared;
    deps.fetchPlayerSnapshot = async (playerId: string) => {
      liveSocketAppeared = true;
      return playerId === AI_ID ? snapshotFor(AI_ID, { manpower: 0, manpowerCap: 1000 }) : undefined;
    };

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).not.toHaveBeenCalled();
    expect(rejectTruce).not.toHaveBeenCalled();
  });

  // Regression: the diplomacy context (season leaderboard) is a further round trip; the re-check must follow it too.
  it("does not auto-respond if a live socket appears while the diplomacy context is loading", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshotFor(AI_ID, { manpower: 0, manpowerCap: 1000 }));
    let liveSocketAppeared = false;
    const context = deps.diplomacyContext();
    const responder = createSeededAiDiplomacyResponder({
      ...deps,
      hasLiveSocket: () => liveSocketAppeared,
      diplomacyContext: async () => {
        liveSocketAppeared = true;
        return context;
      }
    });

    await responder.maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).not.toHaveBeenCalled();
    expect(rejectTruce).not.toHaveBeenCalled();
  });

  it("ignores offers to players that aren't seeded AIs", async () => {
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshotFor(AI_ID, { manpower: 0, manpowerCap: 1000 }));

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiTruce({ ...baseRequest, toPlayerId: "human-2" });

    expect(acceptTruce).not.toHaveBeenCalled();
    expect(rejectTruce).not.toHaveBeenCalled();
  });
});

describe("createSeededAiDiplomacyResponder alliance offers", () => {
  // Friendly takes more than strength: no border friction, respect for a
  // stronger empire, and past payments (capped goodwill) together.
  it("allies for free once Friendly, and syncs the alliance to the simulation", async () => {
    const { deps, acceptAlliance, rejectAlliance, syncAllianceToSimulation } = makeDeps(
      snapshotFor(AI_ID, { manpower: 800, manpowerCap: 1000, score: 100, leaderboardTiles: { [AI_ID]: 100, [HUMAN_ID]: 50 } }),
      snapshotFor(HUMAN_ID, { manpower: 800, manpowerCap: 1000, score: 200 }),
      quietContext({ goodwillCoin: 120 })
    );

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiAlliance(allianceRequest);

    expect(rejectAlliance).not.toHaveBeenCalled();
    expect(acceptAlliance).toHaveBeenCalledWith(AI_ID, allianceRequest.id, {
      [HUMAN_ID]: "Alden Vale accepted your alliance. Alden Vale fears your strength.",
      [AI_ID]: "You accepted Human's alliance."
    });
    expect(syncAllianceToSimulation).toHaveBeenCalledWith({ playerId: AI_ID, targetPlayerId: HUMAN_ID, allied: true });
  });

  // No size for the AI on its leaderboard: it can't tell whether it would lead the bloc, so it doesn't guess.
  it("declines an alliance while its leaderboard can't vouch for its size", async () => {
    const { deps, acceptAlliance, rejectAlliance } = makeDeps(
      snapshotFor(AI_ID, { manpower: 800, manpowerCap: 1000, score: 100 }),
      snapshotFor(HUMAN_ID, { manpower: 800, manpowerCap: 1000, score: 200 }),
      quietContext({ goodwillCoin: 120 })
    );

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiAlliance(allianceRequest);

    expect(acceptAlliance).not.toHaveBeenCalled();
    expect(rejectAlliance).toHaveBeenCalledWith(AI_ID, allianceRequest.id, expect.objectContaining({
      announcementByPlayerId: expect.objectContaining({ [HUMAN_ID]: expect.stringContaining("can't weigh up an alliance right now") })
    }));
  });

  it("won't ally with a merely Cautious AI's neighbour", async () => {
    const { deps, acceptAlliance, rejectAlliance } = makeDeps(
      snapshotFor(AI_ID, { manpower: 800, manpowerCap: 1000, score: 100 }),
      snapshotFor(HUMAN_ID, { manpower: 800, manpowerCap: 1000, score: 100 })
    );

    await createSeededAiDiplomacyResponder(deps).maybeAutoRespondToSeededAiAlliance(allianceRequest);

    expect(acceptAlliance).not.toHaveBeenCalled();
    expect(rejectAlliance).toHaveBeenCalledWith(AI_ID, allianceRequest.id, expect.objectContaining({ startCooldown: true }));
  });
});

describe("aiDiplomacyAnnouncements", () => {
  // The client titles truce popups off the word "declined"; accept wording
  // must never contain it, decline wording always must.
  it("keeps 'declined' in decline wording and out of accept wording", () => {
    const names = { aiName: "Milo", requesterName: "Beejac" };
    expect(aiDiplomacyAnnouncements("truce", false, names, "Milo fears your strength.", 12).toRequester).toContain("declined");
    expect(aiDiplomacyAnnouncements("truce", true, names, "Milo fears your strength.", 12).toRequester).not.toContain("declined");
    expect(aiDiplomacyAnnouncements("alliance", true, names, "Milo fears your strength.").toRequester).toBe("Milo accepted your alliance. Milo fears your strength.");
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

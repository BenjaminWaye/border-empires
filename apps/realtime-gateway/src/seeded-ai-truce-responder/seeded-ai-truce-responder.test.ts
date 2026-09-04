import { describe, expect, it, vi } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { createSeededAiTruceResponder } from "./seeded-ai-truce-responder.js";
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
});

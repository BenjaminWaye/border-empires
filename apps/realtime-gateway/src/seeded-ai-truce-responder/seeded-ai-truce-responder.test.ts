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

type TileSpec = PlayerSubscriptionSnapshot["tiles"][number];

const aiTile = (x: number, y: number, townType?: TileSpec["townType"]): TileSpec => ({
  x,
  y,
  terrain: "LAND",
  ownerId: AI_ID,
  ...(townType ? { townType } : {})
});

const humanTile = (x: number, y: number): TileSpec => ({ x, y, terrain: "LAND", ownerId: HUMAN_ID });

const snapshotWith = (tiles: TileSpec[]): PlayerSubscriptionSnapshot => ({ playerId: HUMAN_ID, tiles });

const makeDeps = (snapshot: PlayerSubscriptionSnapshot, player?: PlayerSubscriptionSnapshot["player"]) => {
  const acceptTruce = vi.fn().mockReturnValue({ ok: true, notifyPlayerIds: [HUMAN_ID, AI_ID], payloadsByPlayerId: new Map() });
  const rejectTruce = vi.fn().mockReturnValue({ ok: true, notifyPlayerIds: [HUMAN_ID, AI_ID], payloadsByPlayerId: new Map() });
  return {
    deps: {
      seededAiPlayerIds: new Set([AI_ID]),
      seedPlayers: new Map(),
      seedWorld: { tiles: new Map() } as never,
      snapshotForPlayer: (playerId: string) => (playerId === HUMAN_ID ? { ...snapshot, player } : undefined),
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

describe("seededAiTruceDecisionFromSnapshot (via createSeededAiTruceResponder)", () => {
  it("accepts a truce when the AI is losing heavily (large share of remaining land under pressure), even with town threatened and economy not yet strained", async () => {
    // AI owns 4 land tiles total; 2 of them (including its town) directly
    // border the human requester -- a 50% pressured-tile ratio, well past
    // the losing-heavily threshold.
    const snapshot = snapshotWith([
      aiTile(0, 0, "MARKET"),
      aiTile(0, 1),
      aiTile(0, 2),
      aiTile(0, 3),
      humanTile(1, 0),
      humanTile(1, 1)
    ]);
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshot, { incomePerMinute: 200 } as never);

    const { maybeAutoRespondToSeededAiTruce } = createSeededAiTruceResponder(deps);
    await maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(acceptTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id);
    expect(rejectTruce).not.toHaveBeenCalled();
  });

  it("still rejects when only lightly pressured (below the losing-heavily threshold) with town threatened and economy healthy", async () => {
    // AI owns 8 land tiles total; only 1 (its town) borders the requester --
    // a 12.5% pressured-tile ratio, below the losing-heavily threshold, so
    // the AI holds out rather than accepting.
    const snapshot = snapshotWith([
      aiTile(0, 0, "MARKET"),
      aiTile(0, 1),
      aiTile(0, 2),
      aiTile(0, 3),
      aiTile(0, 4),
      aiTile(0, 5),
      aiTile(0, 6),
      aiTile(0, 7),
      humanTile(1, 0)
    ]);
    const { deps, acceptTruce, rejectTruce } = makeDeps(snapshot, { incomePerMinute: 200 } as never);

    const { maybeAutoRespondToSeededAiTruce } = createSeededAiTruceResponder(deps);
    await maybeAutoRespondToSeededAiTruce(baseRequest);

    expect(rejectTruce).toHaveBeenCalledWith(AI_ID, baseRequest.id, expect.anything());
    expect(acceptTruce).not.toHaveBeenCalled();
  });
});

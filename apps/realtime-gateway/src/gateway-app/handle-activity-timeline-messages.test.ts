import { describe, expect, it, vi } from "vitest";

import { handleRequestPersonalActivityMessage, handleAcknowledgeActivitySeenMessage } from "./handle-activity-timeline-messages.js";
import type { PersonalActivityTimeline } from "@border-empires/game-domain";

const emptyTimeline = (from: number, to: number): PersonalActivityTimeline => ({
  playerId: "player-1",
  from,
  to,
  summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
  goldPlundered: 0,
  goldRaidedFromYou: 0,
  manpowerSpentAttacking: 0,
  cards: [],
  truncated: false
});

describe("handleRequestPersonalActivityMessage", () => {
  it("requests exactly the trailing 24h window scoped to the given playerId, never a client-supplied range", async () => {
    const sent: unknown[] = [];
    const getPersonalActivityTimeline = vi.fn(async (playerId: string, from: number, to: number) => emptyTimeline(from, to));
    await handleRequestPersonalActivityMessage({
      playerId: "player-1",
      now: () => 1_700_000_000_000,
      getPersonalActivityTimeline,
      sendJson: (payload) => sent.push(payload)
    });
    expect(getPersonalActivityTimeline).toHaveBeenCalledWith("player-1", 1_700_000_000_000 - 24 * 60 * 60_000, 1_700_000_000_000);
    expect(sent).toEqual([{ type: "PERSONAL_ACTIVITY_TIMELINE", timeline: emptyTimeline(1_700_000_000_000 - 24 * 60 * 60_000, 1_700_000_000_000) }]);
  });

  it("records the response payload byte size via recordPayloadBytes", async () => {
    const recordPayloadBytes = vi.fn();
    await handleRequestPersonalActivityMessage({
      playerId: "player-1",
      now: () => 1_000,
      getPersonalActivityTimeline: async (playerId, from, to) => emptyTimeline(from, to),
      recordPayloadBytes,
      sendJson: () => {}
    });
    expect(recordPayloadBytes).toHaveBeenCalledTimes(1);
    expect(recordPayloadBytes.mock.calls[0]![0]).toBeGreaterThan(0);
  });

  it("reports a recoverable error instead of throwing when the sim RPC fails", async () => {
    const sent: unknown[] = [];
    await handleRequestPersonalActivityMessage({
      playerId: "player-1",
      now: () => 1_000,
      getPersonalActivityTimeline: async () => {
        throw new Error("sim unavailable");
      },
      sendJson: (payload) => sent.push(payload)
    });
    expect(sent).toEqual([{ type: "ERROR", code: "ACTIVITY_TIMELINE_UNAVAILABLE", message: "sim unavailable" }]);
  });
});

describe("handleAcknowledgeActivitySeenMessage", () => {
  const buildDeps = (overrides: Partial<Parameters<typeof handleAcknowledgeActivitySeenMessage>[0]> = {}) => {
    const sent: unknown[] = [];
    const setActivitySeen = vi.fn(async (playerId: string, seenAtMs: number, seasonId: string) => ({
      lastActivitySeenAt: seenAtMs,
      lastActivitySeenSeasonId: seasonId
    }));
    return {
      deps: {
        playerId: "player-1",
        seenAt: 1_000,
        seasonId: "season-1",
        now: () => 2_000,
        getCurrentSeasonId: async () => "season-1",
        profileStore: { setActivitySeen },
        invalidateProfileCache: vi.fn(),
        sendJson: (payload: unknown) => sent.push(payload),
        ...overrides
      },
      sent,
      setActivitySeen
    };
  };

  it("rejects a future seenAt without touching the profile store", async () => {
    const { deps, sent, setActivitySeen } = buildDeps({ seenAt: 5_000, now: () => 2_000 });
    await handleAcknowledgeActivitySeenMessage(deps);
    expect(sent).toEqual([{ type: "ERROR", code: "ACTIVITY_SEEN_FUTURE", message: "seenAt cannot be in the future" }]);
    expect(setActivitySeen).not.toHaveBeenCalled();
  });

  it("rejects a seasonId that does not match the current season", async () => {
    const { deps, sent, setActivitySeen } = buildDeps({ seasonId: "season-old", getCurrentSeasonId: async () => "season-2" });
    await handleAcknowledgeActivitySeenMessage(deps);
    expect(sent).toEqual([{ type: "ERROR", code: "ACTIVITY_SEEN_SEASON_MISMATCH", message: "seasonId does not match the current season" }]);
    expect(setActivitySeen).not.toHaveBeenCalled();
  });

  it("accepts a matching current-season acknowledgement and echoes the stored watermark", async () => {
    const { deps, sent, setActivitySeen } = buildDeps();
    await handleAcknowledgeActivitySeenMessage(deps);
    expect(setActivitySeen).toHaveBeenCalledWith("player-1", 1_000, "season-1");
    expect(deps.invalidateProfileCache).toHaveBeenCalledWith("player-1");
    expect(sent).toEqual([{ type: "ACTIVITY_SEEN_ACKNOWLEDGED", lastActivitySeenAt: 1_000, lastActivitySeenSeasonId: "season-1" }]);
  });

  it("does not reject when the current season is unknown (sim lookup failed)", async () => {
    // getCurrentSeasonId resolves undefined on error (see the gateway-app.ts
    // call site's try/catch) -- must not hard-fail the acknowledgement just
    // because the season lookup itself was unavailable.
    const { deps, setActivitySeen } = buildDeps({ getCurrentSeasonId: async () => undefined });
    await handleAcknowledgeActivitySeenMessage(deps);
    expect(setActivitySeen).toHaveBeenCalledWith("player-1", 1_000, "season-1");
  });
});

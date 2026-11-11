import { describe, expect, it } from "vitest";
import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";

import { createGlobalStatusBroadcastPayload, type GlobalStatusBroadcastPayloadDeps } from "./global-status-broadcast-payload.js";
import { createScoreHistorySampler, SCORE_HISTORY_SAMPLE_INTERVAL_MS } from "../score-history-sampler/score-history-sampler.js";
import { emptySelfProgressCache } from "../world-status-snapshot/world-status-snapshot.js";

const setup = () => {
  const sampler = createScoreHistorySampler();
  // A season's worth of samples already accumulated.
  for (let i = 0; i < 90; i += 1) sampler.sample("s1", i * SCORE_HISTORY_SAMPLE_INTERVAL_MS, [{ id: "p1", name: "Waypoint", score: i }]);
  const written: Array<{ payload_json?: string }> = [];
  let summary = { seasonId: "s1", seasonVictory: [], leaderboard: { overall: [], byTiles: [], byIncome: [], byTechs: [] } } as unknown as CurrentSeasonSummary;
  const deps = {
    subscriptionRegistry: { subscribedPlayerIds: () => ["p1"] },
    runtime: { getPlayersForLeaderboard: () => [{ id: "p1", name: "Waypoint", points: 10, settledTileCount: 3, techIds: [] }] },
    nonCompetitivePlayerIds: undefined,
    simulationMetrics: { currentAcceptLatencyP95Ms: () => undefined },
    snapshotCache: { peek: () => undefined, update: () => undefined },
    eventStreams: new Set([{ write: (event: { payload_json?: string }) => written.push(event) }]),
    scoreHistorySampler: sampler,
    isPersistenceDegradedOrBacklogged: () => false,
    getCurrentSummary: () => summary,
    setCurrentSummary: (next: CurrentSeasonSummary) => { summary = next; },
    getCurrentSummarySignature: () => "",
    setCurrentSummarySignature: () => undefined,
    getSelfProgress: emptySelfProgressCache
  } as unknown as GlobalStatusBroadcastPayloadDeps;
  return { deps, written };
};

describe("GLOBAL_STATUS_UPDATE payload", () => {
  // Review of PR #2697: with history now kept across restarts, resending the
  // whole season timeline on every broadcast would grow with season age.
  it("does not carry the live score timeline", async () => {
    const { deps, written } = setup();
    await createGlobalStatusBroadcastPayload(deps).perform("cmd-1");
    expect(written).toHaveLength(1);
    const payload = JSON.parse(written[0]!.payload_json ?? "{}") as Record<string, unknown>;
    expect(payload.type).toBe("GLOBAL_STATUS_UPDATE");
    expect(payload).not.toHaveProperty("scoreHistory");
  });
});

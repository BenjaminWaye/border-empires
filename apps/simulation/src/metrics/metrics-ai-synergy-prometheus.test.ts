import { describe, expect, it } from "vitest";

import { createAiPlayerStateMetrics } from "./metrics-ai-player-state.js";
import { renderAiSynergyPrometheusLines } from "./metrics-ai-synergy-prometheus.js";

const SUMMARY = {
  towns: 3,
  manufactories: 5,
  ancillaryDepots: 2,
  ancillaryFactories: 1,
  connectedTowns: 2,
  townsWithTradeNexusInReach: 2,
  townsWithClearingHouseInReach: 1,
  townsWithNeuralWorksInReach: 0,
  townsWithReserveLatticeInReach: 0
};

const BASE = {
  gold: 0, goldCapacity: 0, settledTiles: 0, ownedTiles: 0, manpower: 0,
  manpowerCap: 0, manpowerRegenPerMinute: 0, musterFlags: 0, musterStagedManpower: 0, musterFlagCapacity: 0
};

describe("sim_ai_player_synergy", () => {
  it("renders one gauge per player per summary field", () => {
    const lines = renderAiSynergyPrometheusLines({ "ai-1": SUMMARY });
    expect(lines[0]).toBe("# TYPE sim_ai_player_synergy gauge");
    expect(lines).toContain('sim_ai_player_synergy{player_id="ai-1",kind="manufactories"} 5');
    expect(lines).toHaveLength(1 + Object.keys(SUMMARY).length);
  });

  it("drops a player's synergy gauges once they have no towns", () => {
    const metrics = createAiPlayerStateMetrics();
    metrics.setSimAiPlayerState("ai-1", { ...BASE, economicSynergy: SUMMARY });
    expect(metrics.snapshot().simAiPlayerSynergyGauge["ai-1"]).toEqual(SUMMARY);
    metrics.setSimAiPlayerState("ai-1", { ...BASE });
    expect(metrics.snapshot().simAiPlayerSynergyGauge["ai-1"]).toBeUndefined();
  });
});

// Regression for a real bug: GET /api/activity's getPowerScore called
// ctx.simulationClient.getCurrentSeasonSummary() directly, bypassing the
// hydrateCurrentSeasonSummaryDisplayNames step that getCurrentSeasonSummary
// (a few lines above it) already applies. The sim's own leaderboard.overall
// only ever carries the anonymized "Empire XXXXXX" fallback name — a
// player's chosen display name lives only in the gateway's profileStore —
// so every named human player showed their anonymized name on the activity
// API regardless of what they'd actually set.
import { describe, expect, it } from "vitest";
import type { CurrentSeasonSummary } from "@border-empires/sim-protocol";
import { anonymizedEmpireNameForId } from "@border-empires/shared";
import Fastify from "fastify";

import { buildGatewayHttpRoutesDeps, type BuildGatewayHttpRoutesDepsContext } from "./build-http-routes-deps.js";
import { InMemoryGatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import { InMemoryPlayerGrowthBaselineStore } from "../player-growth-baseline-store/player-growth-baseline-store.js";
import type { createSimulationClient } from "../sim-client/sim-client.js";

const opaquePlayerId = "AAAABBBBCCCCDDDDEEEE";

const buildSummary = (): CurrentSeasonSummary => {
  const overall = [
    { id: opaquePlayerId, name: anonymizedEmpireNameForId(opaquePlayerId), tiles: 5, incomePerMinute: 10, techs: 1, score: 17, rank: 1 }
  ];
  return {
    season: "season-1",
    seasonId: "season-1",
    seasonSequence: 1,
    status: "active",
    startedAt: 1_000,
    worldSeed: 42,
    rulesetId: "seasonal-default",
    // CurrentSeasonSummary carries both the nested `leaderboard.overall` and
    // a flattened top-level `overall` (same data, kept in sync by
    // hydrateCurrentSeasonSummaryDisplayNames) — populate both so this
    // fixture matches what world-status-snapshot.ts actually produces.
    leaderboard: { overall, byTiles: [], byIncome: [], byTechs: [] },
    overall,
    byTiles: [],
    byIncome: [],
    byTechs: [],
    seasonVictory: []
  } as CurrentSeasonSummary;
};

const buildMinimalCtx = (
  overrides: Partial<BuildGatewayHttpRoutesDepsContext>
): BuildGatewayHttpRoutesDepsContext => ({
  startupStartedAt: Date.now(),
  simulationSeedProfile: { mode: "empty" } as BuildGatewayHttpRoutesDepsContext["simulationSeedProfile"],
  simulationHealth: { connected: true, lastReadyAt: Date.now(), lastError: undefined },
  recentGatewayEvents: [],
  buildAttackDebug: () => ({}) as ReturnType<BuildGatewayHttpRoutesDepsContext["buildAttackDebug"]>,
  buildAttackTraces: () => [],
  gatewayMetrics: { renderPrometheus: () => "" },
  simulationClient: {} as unknown as ReturnType<typeof createSimulationClient>,
  profileStore: new InMemoryGatewayPlayerProfileStore(),
  growthBaselineStore: new InMemoryPlayerGrowthBaselineStore(),
  resolveHttpBearerIdentity: async () => undefined,
  rallyLinkStore: {} as BuildGatewayHttpRoutesDepsContext["rallyLinkStore"],
  galaxyPlanetStore: {} as BuildGatewayHttpRoutesDepsContext["galaxyPlanetStore"],
  galaxyEconomyStore: {} as BuildGatewayHttpRoutesDepsContext["galaxyEconomyStore"],
  galaxyEndorsementStore: {} as BuildGatewayHttpRoutesDepsContext["galaxyEndorsementStore"],
  authBindingStore: {} as BuildGatewayHttpRoutesDepsContext["authBindingStore"],
  worldEngineStrikeStore: {} as BuildGatewayHttpRoutesDepsContext["worldEngineStrikeStore"],
  ...overrides
});

describe("buildGatewayHttpRoutesDeps activityApi.getPowerScore", () => {
  it("applies the player's real profile name, not the sim's anonymized fallback", async () => {
    const profileStore = new InMemoryGatewayPlayerProfileStore();
    await profileStore.setProfile(opaquePlayerId, "Real Chosen Name", "#ffffff");

    const summary = buildSummary();
    const ctx = buildMinimalCtx({
      getSocialSnapshot: () => ({
        players: [],
        allianceRecords: [],
        allianceRequests: [],
        activeAllianceBreaks: [],
        completedAllianceBreaks: [],
        truceRequests: [],
        activeTruces: [],
        truceLockouts: []
      }),
      profileStore,
      simulationClient: {
        getCurrentSeasonSummary: async () => summary,
        getActivityDashboard: async () => ({
          generatedAt: Date.now(),
          fortification: [],
          wars: [],
          territoryMomentum: [],
          biggestSwing24h: null,
          frontlineHotspots: []
        })
      } as unknown as ReturnType<typeof createSimulationClient>
    });

    const app = Fastify();
    const deps = buildGatewayHttpRoutesDeps(app, ctx);
    const powerScore = await deps.activityApi!.getPowerScore();

    expect(powerScore).toHaveLength(1);
    expect(powerScore[0]!.name).toBe("Real Chosen Name");
  });
});

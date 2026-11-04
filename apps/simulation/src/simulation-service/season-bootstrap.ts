import crypto from "node:crypto";
import { CURRENT_WORLDGEN_VERSION } from "@border-empires/shared";
import type { SimulationSeasonState } from "@border-empires/sim-protocol";
import { createInitialSeasonState, isSeasonActive, readScheduledSeasonStartAtEnv } from "../season-lifecycle.js";
import { generateSeasonWorld, type SimulationMapStyle, type SimulationRulesetId } from "../season-worldgen/season-worldgen.js";

const randomSeasonWorldSeed = (): number => crypto.randomInt(1, 1_000_000_000);

export const buildBootstrapSeason = async ({
  seasonSequence,
  rulesetId,
  mapStyle,
  aiPlayerCount,
  now,
  onYield, defenseCampaignTargetSeasonId
}: {
  seasonSequence: number;
  rulesetId: SimulationRulesetId;
  mapStyle: SimulationMapStyle;
  aiPlayerCount?: number;
  now: number;
  onYield?: () => Promise<void>; defenseCampaignTargetSeasonId?: string;
}): Promise<{
  seasonState: SimulationSeasonState;
  initialState: Awaited<ReturnType<typeof generateSeasonWorld>>["initialState"];
  initialPlayers: Awaited<ReturnType<typeof generateSeasonWorld>>["initialPlayers"];
}> => {
  const requestedWorldSeed = randomSeasonWorldSeed();
  const generatedWorld = await generateSeasonWorld(rulesetId, requestedWorldSeed, {
    mapStyle,
    ...(typeof aiPlayerCount === "number" ? { aiPlayerCount } : {}),
    ...(onYield ? { onYield } : {})
  });
  const scheduledStartAt = readScheduledSeasonStartAtEnv(); const seasonState = createInitialSeasonState({
    seasonSequence,
    rulesetId,
    worldSeed: generatedWorld.worldSeed,
    mapStyle: generatedWorld.mapStyle, worldgenVersion: CURRENT_WORLDGEN_VERSION,
    startedAt: now, ...(typeof scheduledStartAt === "number" ? { scheduledStartAt } : {}), ...(defenseCampaignTargetSeasonId ? { defenseCampaignTargetSeasonId } : {})
  });
  return {
    seasonState,
    initialState: {
      ...generatedWorld.initialState,
      season: seasonState
    },
    initialPlayers: generatedWorld.initialPlayers
  };
};

/**
 * The season start a runtime's late-join landing reserve is measured from:
 * the live season's `startedAt` while it is `seasonId` and active, otherwise
 * undefined (no late-join bonus). Reading the live state through `getSeason`
 * picks up a pending season's activation (which re-stamps `startedAt`), and
 * pinning `seasonId` keeps a next-season runtime built during rollover from
 * measuring its AI empires' landings against the old season's start.
 */
export const seasonStartedAtClock = (getSeason: () => SimulationSeasonState, seasonId: string) => (): number | undefined => {
  const season = getSeason();
  return season.seasonId === seasonId && isSeasonActive(season) ? season.startedAt : undefined;
};

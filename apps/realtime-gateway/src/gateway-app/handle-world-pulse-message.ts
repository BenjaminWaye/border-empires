import type { ActivityApiResponse, WorldPulse } from "@border-empires/game-domain";

import { buildWorldPulse } from "../activity-api/world-pulse.js";

type WorldPulseProfileStore = {
  get: (playerId: string) => Promise<{ lastWorldPulseRank?: number; lastWorldPulseRankSeasonId?: string } | undefined>;
  setWorldPulseRank: (playerId: string, rank: number, seasonId: string) => Promise<unknown>;
};

export type RequestWorldPulseMessageDeps = {
  playerId: string;
  getActivity: () => Promise<{ activity: ActivityApiResponse; seasonId: string; seasonLabel?: string }>;
  profileStore: WorldPulseProfileStore;
  invalidateProfileCache: (playerId: string) => void;
  recordPayloadBytes?: (bytes: number) => void;
  sendJson: (payload: unknown) => void;
};

export const handleRequestWorldPulseMessage = async (deps: RequestWorldPulseMessageDeps): Promise<void> => {
  try {
    const [profile, source] = await Promise.all([deps.profileStore.get(deps.playerId), deps.getActivity()]);
    const pulse = buildWorldPulse({
      activity: source.activity,
      playerId: deps.playerId,
      seasonId: source.seasonId,
      ...(source.seasonLabel ? { seasonLabel: source.seasonLabel } : {}),
      ...(typeof profile?.lastWorldPulseRank === "number" ? { previousRank: profile.lastWorldPulseRank } : {}),
      ...(profile?.lastWorldPulseRankSeasonId ? { previousRankSeasonId: profile.lastWorldPulseRankSeasonId } : {})
    });
    if (typeof pulse.rank === "number") {
      await deps.profileStore.setWorldPulseRank(deps.playerId, pulse.rank, source.seasonId);
      deps.invalidateProfileCache(deps.playerId);
    }
    const response: { type: "WORLD_PULSE"; pulse: WorldPulse } = { type: "WORLD_PULSE", pulse };
    deps.recordPayloadBytes?.(Buffer.byteLength(JSON.stringify(response), "utf8"));
    deps.sendJson(response);
  } catch (error) {
    deps.sendJson({
      type: "ERROR",
      code: "WORLD_PULSE_UNAVAILABLE",
      message: error instanceof Error ? error.message : "failed to load world pulse"
    });
  }
};

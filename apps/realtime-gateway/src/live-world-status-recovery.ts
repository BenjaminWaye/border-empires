import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import type { GatewayPlayerProfileStore } from "./player-profile-store/player-profile-store.js";
import type { PlayerProfileOverrides } from "./player-profile-overrides.js";

type WorldStatusSnapshot = NonNullable<PlayerSubscriptionSnapshot["worldStatus"]>;
type LeaderboardSnapshot = WorldStatusSnapshot["leaderboard"];
type SeasonVictorySnapshot = WorldStatusSnapshot["seasonVictory"];

const visiblePlayerIdsInLeaderboard = (leaderboard: LeaderboardSnapshot | undefined): string[] => {
  if (!leaderboard) return [];
  const ids = new Set<string>();
  for (const entry of leaderboard.overall) ids.add(entry.id);
  for (const entry of leaderboard.byTiles) ids.add(entry.id);
  for (const entry of leaderboard.byIncome) ids.add(entry.id);
  for (const entry of leaderboard.byTechs) ids.add(entry.id);
  if (leaderboard.selfOverall) ids.add(leaderboard.selfOverall.id);
  if (leaderboard.selfByTiles) ids.add(leaderboard.selfByTiles.id);
  if (leaderboard.selfByIncome) ids.add(leaderboard.selfByIncome.id);
  if (leaderboard.selfByTechs) ids.add(leaderboard.selfByTechs.id);
  return [...ids];
};

export const hydrateVisibleLiveProfileOverrides = async (
  payload: Record<string, unknown>,
  profileStore: GatewayPlayerProfileStore,
  profileOverrides: PlayerProfileOverrides
): Promise<void> => {
  if (payload.type !== "GLOBAL_STATUS_UPDATE") return;
  const leaderboard = payload.leaderboard as LeaderboardSnapshot | undefined;
  const seasonVictory = payload.seasonVictory as SeasonVictorySnapshot | undefined;
  const playerIds = new Set(visiblePlayerIdsInLeaderboard(leaderboard));
  for (const objective of seasonVictory ?? []) {
    if (objective.leaderPlayerId) playerIds.add(objective.leaderPlayerId);
  }
  const missingPlayerIds = [...playerIds].filter((playerId) => !profileOverrides.get(playerId)?.name);
  if (missingPlayerIds.length === 0) return;
  const profiles = await profileStore.getMany(missingPlayerIds);
  for (const profile of profiles) {
    profileOverrides.upsert(profile.playerId, {
      ...(profile.name ? { name: profile.name } : {}),
      ...(profile.tileColor ? { tileColor: profile.tileColor } : {}),
      ...(typeof profile.profileComplete === "boolean" ? { profileComplete: profile.profileComplete } : {})
    });
  }
};

const recoverLeaderboardList = <
  T extends { id: string; name: string }
>(
  entries: T[] | undefined,
  profileOverrides: PlayerProfileOverrides
): T[] | undefined =>
  entries?.map((entry) => {
    const override = profileOverrides.get(entry.id);
    return override?.name ? { ...entry, name: override.name } : entry;
  });

const recoverLeaderboard = (
  leaderboard: LeaderboardSnapshot | undefined,
  profileOverrides: PlayerProfileOverrides
): LeaderboardSnapshot | undefined => {
  if (!leaderboard) return undefined;
  const overall = recoverLeaderboardList(leaderboard.overall, profileOverrides) ?? [];
  const byTiles = recoverLeaderboardList(leaderboard.byTiles, profileOverrides) ?? [];
  const byIncome = recoverLeaderboardList(leaderboard.byIncome, profileOverrides) ?? [];
  const byTechs = recoverLeaderboardList(leaderboard.byTechs, profileOverrides) ?? [];
  const selfOverall = leaderboard.selfOverall
    ? recoverLeaderboardList([leaderboard.selfOverall], profileOverrides)?.[0]
    : undefined;
  const selfByTiles = leaderboard.selfByTiles
    ? recoverLeaderboardList([leaderboard.selfByTiles], profileOverrides)?.[0]
    : undefined;
  const selfByIncome = leaderboard.selfByIncome
    ? recoverLeaderboardList([leaderboard.selfByIncome], profileOverrides)?.[0]
    : undefined;
  const selfByTechs = leaderboard.selfByTechs
    ? recoverLeaderboardList([leaderboard.selfByTechs], profileOverrides)?.[0]
    : undefined;
  return {
    overall,
    byTiles,
    byIncome,
    byTechs,
    ...(selfOverall ? { selfOverall } : {}),
    ...(selfByTiles ? { selfByTiles } : {}),
    ...(selfByIncome ? { selfByIncome } : {}),
    ...(selfByTechs ? { selfByTechs } : {})
  };
};

const recoverSeasonVictory = (
  seasonVictory: SeasonVictorySnapshot | undefined,
  profileOverrides: PlayerProfileOverrides
): SeasonVictorySnapshot | undefined =>
  seasonVictory?.map((objective: NonNullable<SeasonVictorySnapshot>[number]) => {
    if (!objective.leaderPlayerId) return objective;
    const override = profileOverrides.get(objective.leaderPlayerId);
    return override?.name ? { ...objective, leaderName: override.name } : objective;
  });

export const recoverLivePlayerMessage = (
  payload: Record<string, unknown>,
  profileOverrides: PlayerProfileOverrides
): Record<string, unknown> => {
  if (payload.type !== "GLOBAL_STATUS_UPDATE") return payload;

  const leaderboard = recoverLeaderboard(payload.leaderboard as LeaderboardSnapshot | undefined, profileOverrides);
  const seasonVictory = recoverSeasonVictory(payload.seasonVictory as SeasonVictorySnapshot | undefined, profileOverrides);
  return {
    ...payload,
    ...(leaderboard ? { leaderboard } : {}),
    ...(seasonVictory ? { seasonVictory } : {})
  };
};

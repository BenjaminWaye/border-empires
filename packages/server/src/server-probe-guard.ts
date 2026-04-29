import type { Player } from "@border-empires/shared";
import type { AuthIdentity } from "./server-auth.js";

export const STAGING_PROBE_PLAYER_NAME_RE = /^staging-probe-\d+-\d+$/i;

export const isStagingProbePlayerName = (name: string): boolean => STAGING_PROBE_PLAYER_NAME_RE.test(name);

export type StagingProbePlayerReport = {
  playerId: string;
  name: string;
  territoryTiles: number;
  profileComplete: boolean;
};

export const collectStagingProbePlayerReports = (
  players: Iterable<Pick<Player, "id" | "name" | "isAi" | "profileComplete" | "territoryTiles">>
): StagingProbePlayerReport[] => {
  const reports: StagingProbePlayerReport[] = [];
  for (const player of players) {
    if (player.isAi === true) continue;
    if (!isStagingProbePlayerName(player.name)) continue;
    reports.push({
      playerId: player.id,
      name: player.name,
      territoryTiles: player.territoryTiles.size,
      profileComplete: player.profileComplete === true
    });
  }
  return reports;
};

export type UnboundHumanPlayerReport = {
  playerId: string;
  name: string;
  territoryTiles: number;
};

export const collectUnboundHumanPlayerReports = (
  players: Iterable<Pick<Player, "id" | "name" | "isAi" | "profileComplete" | "territoryTiles">>,
  authIdentities: Iterable<Pick<AuthIdentity, "playerId">>
): UnboundHumanPlayerReport[] => {
  const boundPlayerIds = new Set<string>();
  for (const identity of authIdentities) {
    if (!identity.playerId) continue;
    boundPlayerIds.add(identity.playerId);
  }

  const reports: UnboundHumanPlayerReport[] = [];
  for (const player of players) {
    if (player.isAi === true) continue;
    if (player.profileComplete !== true) continue;
    if (player.territoryTiles.size <= 0) continue;
    if (boundPlayerIds.has(player.id)) continue;
    reports.push({
      playerId: player.id,
      name: player.name,
      territoryTiles: player.territoryTiles.size
    });
  }
  return reports;
};

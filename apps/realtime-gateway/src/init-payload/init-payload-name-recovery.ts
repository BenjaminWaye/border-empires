import { aiDisplayNameForId, anonymizedEmpireNameForId, isOpaquePlayerId, PLANETARY_DEFENSE_DISPLAY_NAME, type SeasonVictoryObjectiveView } from "@border-empires/shared";
import type { LegacySnapshotBootstrap } from "../../../simulation/src/legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.js";

/**
 * Name for a player with no stored profile name. AIs always get their listed
 * seasonal name from the id alone, exactly as the gateway's diplomacy names do
 * (auth-identity.ts), so a name the client shows resolves for an offer even
 * if the live leaderboard spells the AI differently.
 */
export const displayNameForSeedPlayer = (playerId: string, fallbackName: string, liveName?: string): string => {
  if (playerId === "barbarian-1") return PLANETARY_DEFENSE_DISPLAY_NAME;
  const aiName = aiDisplayNameForId(playerId);
  if (aiName) return aiName;
  if (liveName) return liveName;
  if (playerId === "player-1") return fallbackName;
  return playerId;
};

const liveNameNeedsSnapshotRecovery = (playerId: string, name: string | undefined): boolean => {
  if (!name) return true;
  if (name === playerId) return true;
  return isOpaquePlayerId(playerId) && name === anonymizedEmpireNameForId(playerId);
};

const snapshotDisplayNameForPlayer = (
  playerId: string,
  snapshotBootstrap: LegacySnapshotBootstrap | undefined
): string | undefined => {
  const snapshotName = snapshotBootstrap?.playerProfiles.get(playerId)?.name?.trim();
  return snapshotName && snapshotName.length > 0 ? snapshotName : undefined;
};

const recoveredEntryName = <T extends { id: string; name: string }>(
  entry: T,
  snapshotBootstrap: LegacySnapshotBootstrap | undefined
): string => {
  if (!liveNameNeedsSnapshotRecovery(entry.id, entry.name)) return entry.name;
  return snapshotDisplayNameForPlayer(entry.id, snapshotBootstrap) ?? entry.name;
};

export const recoverEntryNameFromSnapshot = <T extends { id: string; name: string }>(
  entries: T[],
  snapshotBootstrap: LegacySnapshotBootstrap | undefined
): T[] => entries.map((entry) => ({ ...entry, name: recoveredEntryName(entry, snapshotBootstrap) }));

export const recoverOptionalEntryNameFromSnapshot = <T extends { id: string; name: string }>(
  entry: T | undefined,
  snapshotBootstrap: LegacySnapshotBootstrap | undefined
): T | undefined => (entry ? { ...entry, name: recoveredEntryName(entry, snapshotBootstrap) } : entry);

export const recoverSeasonVictoryNamesFromSnapshot = (
  objectives: SeasonVictoryObjectiveView[],
  snapshotBootstrap: LegacySnapshotBootstrap | undefined
): SeasonVictoryObjectiveView[] =>
  objectives.map((objective) => {
    if (!objective.leaderPlayerId || !liveNameNeedsSnapshotRecovery(objective.leaderPlayerId, objective.leaderName)) {
      return objective;
    }
    const snapshotName = snapshotDisplayNameForPlayer(objective.leaderPlayerId, snapshotBootstrap);
    return snapshotName ? { ...objective, leaderName: snapshotName } : objective;
  });


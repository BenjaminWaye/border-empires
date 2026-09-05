// Pure builder for the ALLIANCE_UPDATE/TRUCE_UPDATE socket payload pair sent
// to each affected player, extracted out of social-state.ts (which sits at
// the repo's 500-line file-size gate and may not grow further -- see
// AGENTS.md's file-and-type-discipline rule). Takes snapshotForPlayer as a
// parameter rather than owning any state itself.
import type { SocialSnapshot } from "./social-state-types.js";

export const buildUpdatePayloads = (
  playerIds: string[],
  snapshotForPlayer: (playerId: string) => SocialSnapshot,
  truceAnnouncementByPlayerId?: Partial<Record<string, string>>,
  allianceAnnouncementByPlayerId?: Partial<Record<string, string>>
): Map<string, unknown[]> => {
  const payloads = new Map<string, unknown[]>();
  for (const playerId of playerIds) {
    const snapshot = snapshotForPlayer(playerId);
    payloads.set(playerId, [
      {
        type: "ALLIANCE_UPDATE",
        allies: snapshot.allies,
        activeAllianceBreaks: snapshot.activeAllianceBreaks,
        recentAllianceBreaks: snapshot.recentAllianceBreaks,
        incomingAllianceRequests: snapshot.incomingAllianceRequests,
        outgoingAllianceRequests: snapshot.outgoingAllianceRequests,
        ...(allianceAnnouncementByPlayerId?.[playerId] ? { announcement: allianceAnnouncementByPlayerId[playerId] } : {})
      },
      {
        type: "TRUCE_UPDATE",
        activeTruces: snapshot.activeTruces,
        truceBreaksThisSeason: snapshot.truceBreaksThisSeason,
        incomingTruceRequests: snapshot.incomingTruceRequests,
        outgoingTruceRequests: snapshot.outgoingTruceRequests,
        ...(truceAnnouncementByPlayerId?.[playerId] ? { announcement: truceAnnouncementByPlayerId[playerId] } : {})
      }
    ]);
  }
  return payloads;
};

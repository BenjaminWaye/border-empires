// Builds one player's SocialSnapshot from createSocialState's maps. Extracted
// out of social-state.ts to keep that file under the repo's 500-line cap.
import type { SocialOfferCooldowns } from "./social-offer-cooldowns.js";
import type {
  SocialActiveTruce,
  SocialAllianceBreak,
  SocialAllianceRequest,
  SocialCompletedAllianceBreak,
  SocialPlayerRecord,
  SocialSnapshot,
  SocialTruceBreakRecord,
  SocialTruceRequest
} from "./social-state-types.js";

export type SocialSnapshotSources = {
  now: () => number;
  playersById: ReadonlyMap<string, SocialPlayerRecord>;
  allianceRequests: ReadonlyMap<string, SocialAllianceRequest>;
  allianceBreaksByPair: ReadonlyMap<string, SocialAllianceBreak>;
  completedAllianceBreaks: ReadonlyMap<string, SocialCompletedAllianceBreak>;
  truceRequests: ReadonlyMap<string, SocialTruceRequest>;
  trucesByPair: ReadonlyMap<string, SocialActiveTruce>;
  truceBreaksByPlayerId: ReadonlyMap<string, SocialTruceBreakRecord[]>;
  offerCooldowns: SocialOfferCooldowns;
};

export const buildSocialSnapshot = (sources: SocialSnapshotSources, player: SocialPlayerRecord): SocialSnapshot => {
  const playerId = player.id;
  const nameOf = (id: string): string => sources.playersById.get(id)?.name ?? id;
  return {
    allies: [...player.allies],
    activeAllianceBreaks: [...sources.allianceBreaksByPair.values()]
      .filter((notice) => notice.playerAId === playerId || notice.playerBId === playerId)
      .map((notice) => {
        const otherPlayerId = notice.playerAId === playerId ? notice.playerBId : notice.playerAId;
        return {
          otherPlayerId,
          otherPlayerName: nameOf(otherPlayerId),
          startedAt: notice.startedAt,
          endsAt: notice.endsAt,
          createdByPlayerId: notice.createdByPlayerId
        };
      }),
    recentAllianceBreaks: [...sources.completedAllianceBreaks.values()]
      .filter((notice) => notice.notificationExpiresAt > sources.now() && (notice.playerAId === playerId || notice.playerBId === playerId))
      .map((notice) => {
        const otherPlayerId = notice.playerAId === playerId ? notice.playerBId : notice.playerAId;
        return {
          otherPlayerId,
          otherPlayerName: nameOf(otherPlayerId),
          startedAt: notice.startedAt,
          endsAt: notice.endsAt,
          finalizedAt: notice.finalizedAt,
          createdByPlayerId: notice.createdByPlayerId
        };
      }),
    incomingAllianceRequests: [...sources.allianceRequests.values()].filter((request) => request.toPlayerId === playerId),
    outgoingAllianceRequests: [...sources.allianceRequests.values()].filter((request) => request.fromPlayerId === playerId),
    incomingTruceRequests: [...sources.truceRequests.values()].filter((request) => request.toPlayerId === playerId),
    outgoingTruceRequests: [...sources.truceRequests.values()].filter((request) => request.fromPlayerId === playerId),
    activeTruces: [...sources.trucesByPair.values()]
      .filter((truce) => truce.endsAt > sources.now() && (truce.playerAId === playerId || truce.playerBId === playerId))
      .map((truce) => {
        const otherPlayerId = truce.playerAId === playerId ? truce.playerBId : truce.playerAId;
        return {
          otherPlayerId,
          otherPlayerName: nameOf(otherPlayerId),
          startedAt: truce.startedAt,
          endsAt: truce.endsAt,
          createdByPlayerId: truce.createdByPlayerId
        };
      }),
    truceBreaksThisSeason: [...(sources.truceBreaksByPlayerId.get(playerId) ?? [])],
    offerCooldowns: sources.offerCooldowns.outgoingFor(playerId).map((entry) => ({
      kind: entry.kind,
      targetPlayerId: entry.toPlayerId,
      until: entry.until
    }))
  };
};

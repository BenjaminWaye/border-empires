// Alliance-break notice lifecycle (start a 24h notice, list expired notices,
// finalize them), extracted out of social-state.ts to keep that file under
// the repo's 500-line cap. Operates on createSocialState's own maps.
import {
  pairKey,
  type SocialActionResult,
  type SocialAllianceBreak,
  type SocialCompletedAllianceBreak,
  type SocialExpiredAllianceBreak,
  type SocialPlayerRecord,
  type SocialState,
  type SocialStateSink
} from "./social-state-types.js";

export const ALLIANCE_BREAK_NOTICE_MS = 24 * 60 * 60_000;
export const COMPLETED_ALLIANCE_BREAK_NOTIFICATION_TTL_MS = 7 * 24 * 60 * 60_000;

export type SocialAllianceBreakDeps = {
  now: () => number;
  sink: SocialStateSink | undefined;
  playersById: ReadonlyMap<string, SocialPlayerRecord>;
  ensurePlayer: (playerId: string) => SocialPlayerRecord;
  allianceBreaksByPair: Map<string, SocialAllianceBreak>;
  completedAllianceBreaks: Map<string, SocialCompletedAllianceBreak>;
  sweepExpired: () => void;
  updatePayloadsFor: (
    playerIds: string[],
    truceAnnouncementByPlayerId?: Partial<Record<string, string>>,
    allianceAnnouncementByPlayerId?: Partial<Record<string, string>>
  ) => Map<string, unknown[]>;
};

export const createSocialAllianceBreaks = (
  deps: SocialAllianceBreakDeps
): Pick<SocialState, "breakAlliance" | "expiredAllianceBreaks" | "finalizeExpiredAllianceBreaks"> => {
  const { now, sink, ensurePlayer, allianceBreaksByPair, completedAllianceBreaks } = deps;

  const expiredAllianceBreaks = (): SocialExpiredAllianceBreak[] => {
    const current = now();
    const expired: SocialExpiredAllianceBreak[] = [];
    for (const notice of allianceBreaksByPair.values()) {
      if (notice.endsAt > current) continue;
      const playerA = ensurePlayer(notice.playerAId);
      const playerB = ensurePlayer(notice.playerBId);
      expired.push({ ...notice, playerIds: [playerA.id, playerB.id] });
    }
    return expired;
  };

  return {
    breakAlliance(playerId, targetPlayerId): SocialActionResult {
      deps.sweepExpired();
      const actor = ensurePlayer(playerId);
      const target = deps.playersById.get(targetPlayerId);
      if (!target || !actor.allies.has(target.id)) return { ok: false, code: "ALLIANCE_BREAK_INVALID", message: "not allied with target" };
      if (allianceBreaksByPair.has(pairKey(actor.id, target.id))) {
        return { ok: false, code: "ALLIANCE_BREAK_INVALID", message: "alliance break notice already active" };
      }
      const notice: SocialAllianceBreak = {
        playerAId: actor.id,
        playerBId: target.id,
        startedAt: now(),
        endsAt: now() + ALLIANCE_BREAK_NOTICE_MS,
        createdByPlayerId: actor.id
      };
      allianceBreaksByPair.set(pairKey(actor.id, target.id), notice);
      sink?.saveAllianceBreak(notice);
      const announcements = {
        [actor.id]: `Alliance break notice sent to ${target.name}. The alliance remains active for 24h.`,
        [target.id]: `${actor.name} started a 24h notice to break your alliance.`
      };
      const payloads = deps.updatePayloadsFor([actor.id, target.id], undefined, announcements);
      payloads.get(target.id)?.push({ type: "ALLIANCE_BREAK_INCOMING", fromName: actor.name, fromPlayerId: actor.id, toPlayerId: target.id });
      return { ok: true, notifyPlayerIds: [actor.id, target.id], payloadsByPlayerId: payloads };
    },
    expiredAllianceBreaks,
    finalizeExpiredAllianceBreaks(pairs) {
      const allowedPairs = pairs ? new Set(pairs.map(([left, right]) => pairKey(left, right))) : undefined;
      const expiredBreaks = expiredAllianceBreaks().filter((notice) =>
        allowedPairs ? allowedPairs.has(pairKey(notice.playerIds[0], notice.playerIds[1])) : true
      );
      const affectedPlayerIds = new Set<string>();
      for (const notice of expiredBreaks) {
        const [playerAId, playerBId] = notice.playerIds;
        const playerA = ensurePlayer(playerAId);
        const playerB = ensurePlayer(playerBId);
        playerA.allies.delete(playerB.id);
        playerB.allies.delete(playerA.id);
        allianceBreaksByPair.delete(pairKey(playerA.id, playerB.id));
        sink?.removeAllianceBreak(playerA.id, playerB.id);
        sink?.removeAlliance(playerA.id, playerB.id);
        const completedNotice: SocialCompletedAllianceBreak = {
          ...notice,
          finalizedAt: now(),
          notificationExpiresAt: now() + COMPLETED_ALLIANCE_BREAK_NOTIFICATION_TTL_MS
        };
        completedAllianceBreaks.set(pairKey(playerA.id, playerB.id), completedNotice);
        sink?.saveCompletedAllianceBreak(completedNotice);
        affectedPlayerIds.add(playerA.id);
        affectedPlayerIds.add(playerB.id);
      }
      const announcementByPlayerId: Partial<Record<string, string>> = {};
      for (const notice of expiredBreaks) {
        const [playerAId, playerBId] = notice.playerIds;
        const playerA = ensurePlayer(playerAId);
        const playerB = ensurePlayer(playerBId);
        announcementByPlayerId[playerAId] = `Your alliance with ${playerB.name} is now broken.`;
        announcementByPlayerId[playerBId] = `Your alliance with ${playerA.name} is now broken.`;
      }
      return {
        expiredBreaks,
        payloadsByPlayerId: deps.updatePayloadsFor([...affectedPlayerIds], undefined, announcementByPlayerId)
      };
    }
  };
};

import crypto from "node:crypto";

import { TRUCE_BREAK_LOCKOUT_MS, TRUCE_REQUEST_TTL_MS } from "@border-empires/game-domain";
import {
  activeTruceBetween,
  findAllianceRequestBetweenPlayers,
  findTruceRequestBetweenPlayers,
  pairKey,
  playerIsTruceLockedOut,
  type SocialActionResult,
  type SocialActiveTruce,
  type SocialAllianceBreak,
  type SocialAllianceRequest,
  type SocialCompletedAllianceBreak,
  type SocialExpiredAllianceBreak,
  type SocialPlayerRecord,
  type SocialSnapshot,
  type SocialState,
  type SocialStateInitial,
  type SocialStateSink,
  type SocialSyncResult,
  type SocialTruceBreakRecord,
  type SocialTruceRequest
} from "./social-state-types.js";
import { buildUpdatePayloads } from "./social-state-payloads.js";

export type {
  SocialActiveTruce,
  SocialAllianceBreak,
  SocialAllianceRequest,
  SocialCompletedAllianceBreak,
  SocialSnapshot,
  SocialState,
  SocialStateInitial,
  SocialStateSink,
  SocialTruceBreakRecord,
  SocialTruceRequest
} from "./social-state-types.js";

export const ALLIANCE_BREAK_NOTICE_MS = 24 * 60 * 60_000;
export const COMPLETED_ALLIANCE_BREAK_NOTIFICATION_TTL_MS = 7 * 24 * 60 * 60_000;

export const createSocialState = (options: {
  now?: () => number;
  players?: Array<{ id: string; name: string }>;
  initial?: SocialStateInitial;
  sink?: SocialStateSink;
} = {}): SocialState => {
  const now = options.now ?? (() => Date.now());
  const sink = options.sink;
  const playersById = new Map<string, SocialPlayerRecord>();
  const allianceRequests = new Map<string, SocialAllianceRequest>();
  const allianceBreaksByPair = new Map<string, SocialAllianceBreak>();
  const completedAllianceBreaks = new Map<string, SocialCompletedAllianceBreak>();
  const truceRequests = new Map<string, SocialTruceRequest>();
  const trucesByPair = new Map<string, SocialActiveTruce>();
  const truceLockoutUntilByPlayerId = new Map<string, number>();
  const truceBreaksByPlayerId = new Map<string, SocialTruceBreakRecord[]>();

  const ensurePlayer = (playerId: string, fallbackName?: string): SocialPlayerRecord => {
    const existing = playersById.get(playerId);
    if (existing) return existing;
    const created: SocialPlayerRecord = {
      id: playerId,
      name: fallbackName ?? playerId,
      allies: new Set<string>()
    };
    playersById.set(playerId, created);
    return created;
  };

  const resolveByName = (playerName: string): SocialPlayerRecord | undefined => {
    const needle = playerName.trim().toLocaleLowerCase();
    if (!needle) return undefined;
    for (const player of playersById.values()) {
      if (player.name.trim().toLocaleLowerCase() === needle) return player;
    }
    return undefined;
  };

  const sweepExpired = (): void => {
    const current = now();
    let pruned = false;
    for (const [requestId, request] of truceRequests) {
      if (request.expiresAt <= current) {
        truceRequests.delete(requestId);
        pruned = true;
      }
    }
    for (const [key, truce] of trucesByPair) {
      if (truce.endsAt <= current) {
        trucesByPair.delete(key);
        pruned = true;
      }
    }
    for (const [key, notice] of completedAllianceBreaks) {
      if (notice.notificationExpiresAt <= current) {
        completedAllianceBreaks.delete(key);
        pruned = true;
      }
    }
    for (const [playerId, lockoutUntil] of truceLockoutUntilByPlayerId) {
      if (lockoutUntil <= current) {
        truceLockoutUntilByPlayerId.delete(playerId);
        pruned = true;
      }
    }
    if (pruned) sink?.pruneExpired(current);
  };

  const snapshotForPlayer = (playerId: string): SocialSnapshot => {
    sweepExpired();
    const player = ensurePlayer(playerId);
    return {
      allies: [...player.allies],
      activeAllianceBreaks: [...allianceBreaksByPair.values()]
        .filter((notice) => notice.playerAId === playerId || notice.playerBId === playerId)
        .map((notice) => {
          const otherPlayerId = notice.playerAId === playerId ? notice.playerBId : notice.playerAId;
          return {
            otherPlayerId,
            otherPlayerName: playersById.get(otherPlayerId)?.name ?? otherPlayerId,
            startedAt: notice.startedAt,
            endsAt: notice.endsAt,
            createdByPlayerId: notice.createdByPlayerId
          };
        }),
      recentAllianceBreaks: [...completedAllianceBreaks.values()]
        .filter((notice) => notice.notificationExpiresAt > now() && (notice.playerAId === playerId || notice.playerBId === playerId))
        .map((notice) => {
          const otherPlayerId = notice.playerAId === playerId ? notice.playerBId : notice.playerAId;
          return {
            otherPlayerId,
            otherPlayerName: playersById.get(otherPlayerId)?.name ?? otherPlayerId,
            startedAt: notice.startedAt,
            endsAt: notice.endsAt,
            finalizedAt: notice.finalizedAt,
            createdByPlayerId: notice.createdByPlayerId
          };
        }),
      incomingAllianceRequests: [...allianceRequests.values()].filter((request) => request.toPlayerId === playerId),
      outgoingAllianceRequests: [...allianceRequests.values()].filter((request) => request.fromPlayerId === playerId),
      incomingTruceRequests: [...truceRequests.values()].filter((request) => request.toPlayerId === playerId),
      outgoingTruceRequests: [...truceRequests.values()].filter((request) => request.fromPlayerId === playerId),
      activeTruces: [...trucesByPair.values()]
        .filter((truce) => truce.endsAt > now() && (truce.playerAId === playerId || truce.playerBId === playerId))
        .map((truce) => {
          const otherPlayerId = truce.playerAId === playerId ? truce.playerBId : truce.playerAId;
          return {
            otherPlayerId,
            otherPlayerName: playersById.get(otherPlayerId)?.name ?? otherPlayerId,
            startedAt: truce.startedAt,
            endsAt: truce.endsAt,
            createdByPlayerId: truce.createdByPlayerId
          };
        }),
      truceBreaksThisSeason: truceBreaksByPlayerId.get(playerId) ?? []
    };
  };

  const updatePayloadsFor = (
    playerIds: string[],
    truceAnnouncementByPlayerId?: Partial<Record<string, string>>,
    allianceAnnouncementByPlayerId?: Partial<Record<string, string>>
  ): Map<string, unknown[]> => buildUpdatePayloads(playerIds, snapshotForPlayer, truceAnnouncementByPlayerId, allianceAnnouncementByPlayerId);

  const ok = (playerIds: string[], announcementByPlayerId?: Partial<Record<string, string>>): SocialSyncResult => ({
    ok: true,
    notifyPlayerIds: playerIds,
    payloadsByPlayerId: updatePayloadsFor(playerIds, announcementByPlayerId)
  });

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

  for (const player of options.players ?? []) ensurePlayer(player.id, player.name);

  if (options.initial) {
    for (const player of options.initial.players ?? []) {
      const record = ensurePlayer(player.id, player.name);
      record.name = player.name;
      for (const allyId of player.allies ?? []) record.allies.add(allyId);
    }
    for (const request of options.initial.allianceRequests ?? []) {
      allianceRequests.set(request.id, { ...request });
    }
    for (const notice of options.initial.activeAllianceBreaks ?? []) {
      allianceBreaksByPair.set(pairKey(notice.playerAId, notice.playerBId), { ...notice });
    }
    for (const notice of options.initial.completedAllianceBreaks ?? []) {
      completedAllianceBreaks.set(pairKey(notice.playerAId, notice.playerBId), { ...notice });
    }
    for (const request of options.initial.truceRequests ?? []) {
      truceRequests.set(request.id, { ...request });
    }
    for (const truce of options.initial.activeTruces ?? []) {
      trucesByPair.set(pairKey(truce.playerAId, truce.playerBId), { ...truce });
    }
    for (const lockout of options.initial.truceLockouts ?? []) {
      truceLockoutUntilByPlayerId.set(lockout.playerId, lockout.lockoutUntil);
    }
    for (const { playerId, ...record } of options.initial.truceBreaks ?? []) {
      const existing = truceBreaksByPlayerId.get(playerId) ?? [];
      existing.push(record);
      truceBreaksByPlayerId.set(playerId, existing);
    }
  }

  return {
    registerPlayer(playerId, name) {
      ensurePlayer(playerId, name).name = name;
      sink?.upsertPlayer(playerId, name);
    },
    renamePlayer(playerId, name) {
      ensurePlayer(playerId, name).name = name;
      sink?.upsertPlayer(playerId, name);
      for (const request of allianceRequests.values()) {
        if (request.fromPlayerId === playerId) request.fromName = name;
        if (request.toPlayerId === playerId) request.toName = name;
        if (request.fromPlayerId === playerId || request.toPlayerId === playerId) {
          sink?.saveAllianceRequest(request);
        }
      }
      for (const request of truceRequests.values()) {
        if (request.fromPlayerId === playerId) request.fromName = name;
        if (request.toPlayerId === playerId) request.toName = name;
        if (request.fromPlayerId === playerId || request.toPlayerId === playerId) {
          sink?.saveTruceRequest(request);
        }
      }
    },
    snapshotForPlayer,
    syncPlayers(playerIds, announcementByPlayerId) {
      return ok(playerIds, announcementByPlayerId);
    },
    requestAlliance(fromPlayerId, targetPlayerName) {
      sweepExpired();
      const actor = ensurePlayer(fromPlayerId);
      const target = resolveByName(targetPlayerName);
      if (!target || target.id === fromPlayerId) return { ok: false, code: "ALLIANCE_TARGET", message: "target not found" };
      if (actor.allies.has(target.id)) return { ok: false, code: "ALLIANCE_EXISTS", message: "already allied" };
      const existingRequest = findAllianceRequestBetweenPlayers(allianceRequests.values(), actor.id, target.id);
      if (existingRequest) {
        const message =
          existingRequest.fromPlayerId === actor.id ? "alliance request already pending" : "that player already sent you an alliance request";
        return { ok: false, code: "ALLIANCE_REQUEST_PENDING", message };
      }
      const request: SocialAllianceRequest = {
        id: crypto.randomUUID(),
        fromPlayerId: actor.id,
        toPlayerId: target.id,
        createdAt: now(),
        fromName: actor.name,
        toName: target.name
      };
      allianceRequests.set(request.id, request);
      sink?.saveAllianceRequest(request);
      const payloads = updatePayloadsFor([actor.id, target.id]);
      payloads.get(actor.id)?.push({ type: "ALLIANCE_REQUESTED", request, targetName: target.name });
      payloads.get(target.id)?.push({ type: "ALLIANCE_REQUEST_INCOMING", request, fromName: actor.name });
      return { ok: true, notifyPlayerIds: [actor.id, target.id], payloadsByPlayerId: payloads };
    },
    acceptAlliance(playerId, requestId) {
      sweepExpired();
      const request = allianceRequests.get(requestId);
      if (!request || request.toPlayerId !== playerId) return { ok: false, code: "ALLIANCE_REQUEST_INVALID", message: "request invalid" };
      const actor = ensurePlayer(playerId);
      const from = playersById.get(request.fromPlayerId);
      if (!from) {
        allianceRequests.delete(requestId);
        sink?.deleteAllianceRequest(requestId);
        return { ok: false, code: "ALLIANCE_REQUEST_INVALID", message: "request sender offline/unknown" };
      }
      actor.allies.add(from.id);
      from.allies.add(actor.id);
      allianceRequests.delete(requestId);
      completedAllianceBreaks.delete(pairKey(actor.id, from.id));
      sink?.deleteAllianceRequest(requestId);
      sink?.addAlliance(actor.id, from.id, now());
      sink?.removeCompletedAllianceBreak(actor.id, from.id);
      return ok([actor.id, from.id]);
    },
    rejectAlliance(playerId, requestId) {
      sweepExpired();
      const request = allianceRequests.get(requestId);
      if (!request || request.toPlayerId !== playerId) return { ok: false, code: "ALLIANCE_REQUEST_INVALID", message: "request invalid" };
      allianceRequests.delete(requestId);
      sink?.deleteAllianceRequest(requestId);
      return ok([playerId, request.fromPlayerId]);
    },
    cancelAlliance(playerId, requestId) {
      sweepExpired();
      const request = allianceRequests.get(requestId);
      if (!request || request.fromPlayerId !== playerId) return { ok: false, code: "ALLIANCE_REQUEST_INVALID", message: "request invalid" };
      allianceRequests.delete(requestId);
      sink?.deleteAllianceRequest(requestId);
      return ok([playerId, request.toPlayerId]);
    },
    breakAlliance(playerId, targetPlayerId) {
      sweepExpired();
      const actor = ensurePlayer(playerId);
      const target = playersById.get(targetPlayerId);
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
      const payloads = updatePayloadsFor([actor.id, target.id], undefined, announcements);
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
        payloadsByPlayerId: updatePayloadsFor([...affectedPlayerIds], undefined, announcementByPlayerId)
      };
    },
    requestTruce(fromPlayerId, targetPlayerName, durationHours) {
      sweepExpired();
      const actor = ensurePlayer(fromPlayerId);
      const target = resolveByName(targetPlayerName);
      if (!target || target.id === fromPlayerId || target.id.startsWith("barbarian")) {
        return { ok: false, code: "TRUCE_TARGET", message: "target not found" };
      }
      if (playerIsTruceLockedOut(actor.id, truceLockoutUntilByPlayerId, now())) {
        return { ok: false, code: "TRUCE_LOCKED_OUT", message: "you broke a truce recently and cannot request a new truce yet" };
      }
      if (activeTruceBetween(actor.id, target.id, trucesByPair, now())) {
        return { ok: false, code: "TRUCE_EXISTS", message: "you already have an active truce with that player" };
      }
      if (findTruceRequestBetweenPlayers(truceRequests.values(), actor.id, target.id)) {
        return { ok: false, code: "TRUCE_REQUEST_PENDING", message: "a truce offer is already pending" };
      }
      const request: SocialTruceRequest = {
        id: crypto.randomUUID(),
        fromPlayerId: actor.id,
        toPlayerId: target.id,
        createdAt: now(),
        expiresAt: now() + TRUCE_REQUEST_TTL_MS,
        durationHours,
        fromName: actor.name,
        toName: target.name
      };
      truceRequests.set(request.id, request);
      sink?.saveTruceRequest(request);
      const payloads = updatePayloadsFor([actor.id, target.id]);
      payloads.get(actor.id)?.push({ type: "TRUCE_REQUESTED", request, targetName: target.name });
      payloads.get(target.id)?.push({ type: "TRUCE_REQUEST_INCOMING", request, fromName: actor.name });
      return { ok: true, notifyPlayerIds: [actor.id, target.id], payloadsByPlayerId: payloads };
    },
    acceptTruce(playerId, requestId) {
      sweepExpired();
      const request = truceRequests.get(requestId);
      if (!request || request.toPlayerId !== playerId || request.expiresAt < now()) {
        return { ok: false, code: "TRUCE_REQUEST_INVALID", message: "request invalid or expired" };
      }
      const actor = ensurePlayer(playerId);
      const from = playersById.get(request.fromPlayerId);
      if (!from) {
        truceRequests.delete(requestId);
        sink?.deleteTruceRequest(requestId);
        return { ok: false, code: "TRUCE_REQUEST_INVALID", message: "request sender offline/unknown" };
      }
      if (
        playerIsTruceLockedOut(actor.id, truceLockoutUntilByPlayerId, now()) ||
        playerIsTruceLockedOut(from.id, truceLockoutUntilByPlayerId, now())
      ) {
        truceRequests.delete(requestId);
        sink?.deleteTruceRequest(requestId);
        return { ok: false, code: "TRUCE_LOCKED_OUT", message: "one player broke a truce recently and is locked out" };
      }
      if (activeTruceBetween(actor.id, from.id, trucesByPair, now())) {
        truceRequests.delete(requestId);
        sink?.deleteTruceRequest(requestId);
        return { ok: false, code: "TRUCE_EXISTS", message: "you already have an active truce with that player" };
      }
      const truce: SocialActiveTruce = {
        playerAId: actor.id < from.id ? actor.id : from.id,
        playerBId: actor.id < from.id ? from.id : actor.id,
        startedAt: now(),
        endsAt: now() + request.durationHours * 60 * 60_000,
        createdByPlayerId: from.id
      };
      truceRequests.delete(requestId);
      trucesByPair.set(pairKey(actor.id, from.id), truce);
      sink?.deleteTruceRequest(requestId); sink?.saveActiveTruce(truce);
      const announcement = `${actor.name} and ${from.name} agreed to a ${request.durationHours}h truce.`;
      return ok([actor.id, from.id], { [actor.id]: announcement, [from.id]: announcement });
    },
    rejectTruce(playerId, requestId, announcementByPlayerId) {
      sweepExpired();
      const request = truceRequests.get(requestId);
      if (!request || request.toPlayerId !== playerId || request.expiresAt < now()) {
        return { ok: false, code: "TRUCE_REQUEST_INVALID", message: "request invalid or expired" };
      }
      truceRequests.delete(requestId);
      sink?.deleteTruceRequest(requestId);
      return ok([playerId, request.fromPlayerId], announcementByPlayerId);
    },
    cancelTruce(playerId, requestId) {
      sweepExpired();
      const request = truceRequests.get(requestId);
      if (!request || request.fromPlayerId !== playerId || request.expiresAt < now()) {
        return { ok: false, code: "TRUCE_REQUEST_INVALID", message: "request invalid or expired" };
      }
      truceRequests.delete(requestId);
      sink?.deleteTruceRequest(requestId);
      return ok([playerId, request.toPlayerId]);
    },
    breakTruce(playerId, targetPlayerId) {
      sweepExpired();
      const actor = ensurePlayer(playerId);
      const target = playersById.get(targetPlayerId);
      const truce = target ? activeTruceBetween(actor.id, target.id, trucesByPair, now()) : undefined;
      if (!target || !truce) return { ok: false, code: "TRUCE_BREAK_INVALID", message: "no active truce with target" };
      trucesByPair.delete(pairKey(actor.id, target.id));
      sink?.removeActiveTruce(actor.id, target.id);
      const lockoutUntil = now() + TRUCE_BREAK_LOCKOUT_MS;
      truceLockoutUntilByPlayerId.set(actor.id, lockoutUntil); sink?.saveTruceLockout(actor.id, lockoutUntil);
      const breakRecord: SocialTruceBreakRecord = { targetPlayerId: target.id, targetPlayerName: target.name, brokenAt: now() };
      const breaks = truceBreaksByPlayerId.get(actor.id) ?? [];
      breaks.push(breakRecord);
      truceBreaksByPlayerId.set(actor.id, breaks);
      sink?.saveTruceBreak(actor.id, breakRecord);
      const announcement = `${actor.name} broke the truce with ${target.name} early and is locked out of new truces for 24h.`;
      return ok([actor.id, target.id], { [actor.id]: announcement, [target.id]: `${actor.name} broke the truce with ${target.name}.` });
    },
    activeTrucePairs: () => (sweepExpired(), [...trucesByPair.values()].map((truce): [string, string] => [truce.playerAId, truce.playerBId]))
  };
};

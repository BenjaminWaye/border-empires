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
  type SocialPendingOffer,
  type SocialPlayerRecord,
  type SocialSnapshot,
  type SocialState,
  type SocialStateInitial,
  type SocialStateSink,
  type SocialSyncResult,
  type SocialTruceBreakRecord,
  type SocialTruceRequest
} from "./social-state-types.js";
import { diplomacyTermsAreEmpty, type DiplomacyTerms } from "@border-empires/shared";

import { buildUpdatePayloads } from "./social-state-payloads.js";
import { buildSocialSnapshot } from "./social-state-snapshot.js";
import { createSocialAllianceBreaks } from "./social-state-alliance-breaks.js";
import {
  createSocialOfferCooldowns,
  formatCooldownRemaining,
  OFFER_EXPIRED_COOLDOWN_MS,
  OFFER_REJECTED_COOLDOWN_MS,
  type SocialOfferKind
} from "./social-offer-cooldowns.js";

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

export { ALLIANCE_BREAK_NOTICE_MS, COMPLETED_ALLIANCE_BREAK_NOTIFICATION_TTL_MS } from "./social-state-alliance-breaks.js";
// Bounds the per-player truceBreaksByPlayerId list (a season-long, otherwise
// unbounded growable array -- see docs/agents/state-and-persistence-discipline.md).
// A player realistically breaks a handful of truces per season; this caps the
// list to the most recent breaks rather than growing forever.
export const MAX_TRUCE_BREAKS_PER_PLAYER = 20;

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
  const offerCooldowns = createSocialOfferCooldowns(now, options.initial?.offerCooldowns);
  // Offers whose terms the simulation is paying out right now (beginSettlement).
  const settlingRequestIds = new Set<string>();
  const settlingError: SocialActionResult = { ok: false, code: "OFFER_SETTLING", message: "That offer is being settled right now." };
  const termsField = (terms: DiplomacyTerms | undefined): { terms?: DiplomacyTerms } => (terms && !diplomacyTermsAreEmpty(terms) ? { terms } : {});
  const startOfferCooldown = (kind: SocialOfferKind, fromPlayerId: string, toPlayerId: string, durationMs: number): void => {
    sink?.saveOfferCooldown(offerCooldowns.start(kind, fromPlayerId, toPlayerId, durationMs));
  };
  const offerCooldownError = (kind: SocialOfferKind, fromPlayerId: string, target: SocialPlayerRecord): SocialActionResult | undefined => {
    const remainingMs = offerCooldowns.remainingMs(kind, fromPlayerId, target.id);
    if (remainingMs <= 0) return undefined;
    const code = kind === "truce" ? "TRUCE_OFFER_COOLDOWN" : "ALLIANCE_OFFER_COOLDOWN";
    return { ok: false, code, message: `You can offer ${target.name} ${kind === "truce" ? "a truce" : "an alliance"} again in ${formatCooldownRemaining(remainingMs)}.` };
  };

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
      if (request.expiresAt <= current && !settlingRequestIds.has(requestId)) {
        truceRequests.delete(requestId);
        startOfferCooldown("truce", request.fromPlayerId, request.toPlayerId, OFFER_EXPIRED_COOLDOWN_MS);
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
    if (offerCooldowns.sweep()) pruned = true;
    if (pruned) sink?.pruneExpired(current);
  };

  const snapshotForPlayer = (playerId: string): SocialSnapshot => {
    sweepExpired();
    return buildSocialSnapshot(
      { now, playersById, allianceRequests, allianceBreaksByPair, completedAllianceBreaks, truceRequests, trucesByPair, truceBreaksByPlayerId, offerCooldowns },
      ensurePlayer(playerId)
    );
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

  const allianceBreaks = createSocialAllianceBreaks({
    now, sink, playersById, ensurePlayer, allianceBreaksByPair, completedAllianceBreaks, sweepExpired, updatePayloadsFor
  });

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
      if (existing.length > MAX_TRUCE_BREAKS_PER_PLAYER) existing.splice(0, existing.length - MAX_TRUCE_BREAKS_PER_PLAYER);
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
    requestAlliance(fromPlayerId, targetPlayerName, offerOptions) {
      sweepExpired();
      const actor = ensurePlayer(fromPlayerId);
      const target = offerOptions?.targetPlayerId ? playersById.get(offerOptions.targetPlayerId) : resolveByName(targetPlayerName);
      if (!target || target.id === fromPlayerId) return { ok: false, code: "ALLIANCE_TARGET", message: "target not found" };
      if (actor.allies.has(target.id)) return { ok: false, code: "ALLIANCE_EXISTS", message: "already allied" };
      const existingRequest = findAllianceRequestBetweenPlayers(allianceRequests.values(), actor.id, target.id);
      if (existingRequest) {
        const message =
          existingRequest.fromPlayerId === actor.id ? "alliance request already pending" : "that player already sent you an alliance request";
        return { ok: false, code: "ALLIANCE_REQUEST_PENDING", message };
      }
      const allianceCooldownError = offerCooldownError("alliance", actor.id, target);
      if (allianceCooldownError) return allianceCooldownError;
      const request: SocialAllianceRequest = {
        id: crypto.randomUUID(),
        fromPlayerId: actor.id,
        toPlayerId: target.id,
        createdAt: now(),
        fromName: actor.name,
        toName: target.name,
        ...termsField(offerOptions?.terms)
      };
      allianceRequests.set(request.id, request);
      sink?.saveAllianceRequest(request);
      const payloads = updatePayloadsFor([actor.id, target.id]);
      payloads.get(actor.id)?.push({ type: "ALLIANCE_REQUESTED", request, targetName: target.name });
      payloads.get(target.id)?.push({ type: "ALLIANCE_REQUEST_INCOMING", request, fromName: actor.name });
      return { ok: true, notifyPlayerIds: [actor.id, target.id], payloadsByPlayerId: payloads };
    },
    acceptAlliance(playerId, requestId, announcementByPlayerId) {
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
      settlingRequestIds.delete(requestId);
      const notifyPlayerIds = [actor.id, from.id];
      return { ok: true, notifyPlayerIds, payloadsByPlayerId: updatePayloadsFor(notifyPlayerIds, undefined, announcementByPlayerId) };
    },
    rejectAlliance(playerId, requestId, options) {
      sweepExpired();
      const request = allianceRequests.get(requestId);
      if (!request || request.toPlayerId !== playerId) return { ok: false, code: "ALLIANCE_REQUEST_INVALID", message: "request invalid" };
      if (settlingRequestIds.has(requestId)) return settlingError;
      allianceRequests.delete(requestId);
      sink?.deleteAllianceRequest(requestId);
      if (options?.startCooldown !== false) startOfferCooldown("alliance", request.fromPlayerId, request.toPlayerId, OFFER_REJECTED_COOLDOWN_MS);
      const notifyPlayerIds = [playerId, request.fromPlayerId];
      return { ok: true, notifyPlayerIds, payloadsByPlayerId: updatePayloadsFor(notifyPlayerIds, undefined, options?.announcementByPlayerId) };
    },
    cancelAlliance(playerId, requestId) {
      sweepExpired();
      const request = allianceRequests.get(requestId);
      if (!request || request.fromPlayerId !== playerId) return { ok: false, code: "ALLIANCE_REQUEST_INVALID", message: "request invalid" };
      if (settlingRequestIds.has(requestId)) return settlingError;
      allianceRequests.delete(requestId);
      sink?.deleteAllianceRequest(requestId);
      startOfferCooldown("alliance", request.fromPlayerId, request.toPlayerId, OFFER_REJECTED_COOLDOWN_MS);
      return ok([playerId, request.toPlayerId]);
    },
    ...allianceBreaks,
    requestTruce(fromPlayerId, targetPlayerName, durationHours, offerOptions) {
      sweepExpired();
      const actor = ensurePlayer(fromPlayerId);
      const target = offerOptions?.targetPlayerId ? playersById.get(offerOptions.targetPlayerId) : resolveByName(targetPlayerName);
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
      const truceCooldownError = offerCooldownError("truce", actor.id, target);
      if (truceCooldownError) return truceCooldownError;
      const request: SocialTruceRequest = {
        id: crypto.randomUUID(),
        fromPlayerId: actor.id,
        toPlayerId: target.id,
        createdAt: now(),
        expiresAt: now() + TRUCE_REQUEST_TTL_MS,
        durationHours,
        fromName: actor.name,
        toName: target.name,
        ...termsField(offerOptions?.terms)
      };
      truceRequests.set(request.id, request);
      sink?.saveTruceRequest(request);
      const payloads = updatePayloadsFor([actor.id, target.id]);
      payloads.get(actor.id)?.push({ type: "TRUCE_REQUESTED", request, targetName: target.name });
      payloads.get(target.id)?.push({ type: "TRUCE_REQUEST_INCOMING", request, fromName: actor.name });
      return { ok: true, notifyPlayerIds: [actor.id, target.id], payloadsByPlayerId: payloads };
    },
    acceptTruce(playerId, requestId, announcementByPlayerId) {
      sweepExpired();
      const request = truceRequests.get(requestId);
      // A settling offer may pass its expiry while the simulation pays out; it still completes.
      if (!request || request.toPlayerId !== playerId || (request.expiresAt < now() && !settlingRequestIds.has(requestId))) {
        return { ok: false, code: "TRUCE_REQUEST_INVALID", message: "request invalid or expired" };
      }
      settlingRequestIds.delete(requestId);
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
      return ok([actor.id, from.id], announcementByPlayerId ?? { [actor.id]: announcement, [from.id]: announcement });
    },
    rejectTruce(playerId, requestId, options) {
      sweepExpired();
      const request = truceRequests.get(requestId);
      if (!request || request.toPlayerId !== playerId || request.expiresAt < now()) {
        return { ok: false, code: "TRUCE_REQUEST_INVALID", message: "request invalid or expired" };
      }
      if (settlingRequestIds.has(requestId)) return settlingError;
      truceRequests.delete(requestId);
      sink?.deleteTruceRequest(requestId);
      if (options?.startCooldown !== false) startOfferCooldown("truce", request.fromPlayerId, request.toPlayerId, OFFER_REJECTED_COOLDOWN_MS);
      return ok([playerId, request.fromPlayerId], options?.announcementByPlayerId);
    },
    cancelTruce(playerId, requestId) {
      sweepExpired();
      const request = truceRequests.get(requestId);
      if (!request || request.fromPlayerId !== playerId || request.expiresAt < now()) {
        return { ok: false, code: "TRUCE_REQUEST_INVALID", message: "request invalid or expired" };
      }
      if (settlingRequestIds.has(requestId)) return settlingError;
      truceRequests.delete(requestId);
      sink?.deleteTruceRequest(requestId);
      startOfferCooldown("truce", request.fromPlayerId, request.toPlayerId, OFFER_REJECTED_COOLDOWN_MS);
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
      if (breaks.length > MAX_TRUCE_BREAKS_PER_PLAYER) breaks.splice(0, breaks.length - MAX_TRUCE_BREAKS_PER_PLAYER);
      truceBreaksByPlayerId.set(actor.id, breaks);
      sink?.saveTruceBreak(actor.id, breakRecord);
      const announcement = `${actor.name} broke the truce with ${target.name} early and is locked out of new truces for 24h.`;
      return ok([actor.id, target.id], { [actor.id]: announcement, [target.id]: `${actor.name} broke the truce with ${target.name}.` });
    },
    beginSettlement(kind, playerId, requestId) {
      sweepExpired();
      const invalid = { ok: false as const, code: kind === "truce" ? "TRUCE_REQUEST_INVALID" : "ALLIANCE_REQUEST_INVALID", message: "request invalid or expired" };
      if (settlingRequestIds.has(requestId)) return { ok: false, code: "OFFER_SETTLING", message: "That offer is being settled right now." };
      let offer: SocialPendingOffer | undefined;
      if (kind === "truce") {
        const request = truceRequests.get(requestId);
        if (request && request.expiresAt >= now()) offer = { kind, request };
      } else {
        const request = allianceRequests.get(requestId);
        if (request) offer = { kind, request };
      }
      if (!offer || offer.request.toPlayerId !== playerId) return invalid;
      settlingRequestIds.add(requestId);
      return { ok: true, offer };
    },
    endSettlement: (requestId) => { settlingRequestIds.delete(requestId); },
    playerNameOf: (playerId) => playersById.get(playerId)?.name ?? playerId,
    resolvePlayerByName: (playerName) => {
      const player = resolveByName(playerName);
      return player ? { id: player.id, name: player.name } : undefined;
    },
    activeTrucePairs: () => (sweepExpired(), [...trucesByPair.values()].map((truce): [string, string] => [truce.playerAId, truce.playerBId]))
  };
};

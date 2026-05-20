import crypto from "node:crypto";

import { TRUCE_REQUEST_TTL_MS } from "@border-empires/game-domain";

export type SocialAllianceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  fromName?: string;
  toName?: string;
};

export type SocialTruceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
  durationHours: 12 | 24;
  fromName?: string;
  toName?: string;
};

export type SocialActiveTruce = {
  playerAId: string;
  playerBId: string;
  startedAt: number;
  endsAt: number;
  createdByPlayerId: string;
};

export type SocialSnapshot = {
  allies: string[];
  incomingAllianceRequests: SocialAllianceRequest[];
  outgoingAllianceRequests: SocialAllianceRequest[];
  incomingTruceRequests: SocialTruceRequest[];
  outgoingTruceRequests: SocialTruceRequest[];
  activeTruces: Array<{
    otherPlayerId: string;
    otherPlayerName: string;
    startedAt: number;
    endsAt: number;
    createdByPlayerId: string;
  }>;
};

type SocialPlayerRecord = {
  id: string;
  name: string;
  allies: Set<string>;
};

type SocialActionResult =
  | { ok: true; notifyPlayerIds: string[]; payloadsByPlayerId: Map<string, unknown[]> }
  | { ok: false; code: string; message: string };
type SocialSyncResult = Extract<SocialActionResult, { ok: true }>;

const pairKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

const findAllianceRequestBetweenPlayers = (
  requests: Iterable<SocialAllianceRequest>,
  playerAId: string,
  playerBId: string
): SocialAllianceRequest | undefined => {
  for (const request of requests) {
    if (
      (request.fromPlayerId === playerAId && request.toPlayerId === playerBId) ||
      (request.fromPlayerId === playerBId && request.toPlayerId === playerAId)
    ) {
      return request;
    }
  }
  return undefined;
};

const findTruceRequestBetweenPlayers = (
  requests: Iterable<SocialTruceRequest>,
  playerAId: string,
  playerBId: string
): SocialTruceRequest | undefined => {
  for (const request of requests) {
    if (
      (request.fromPlayerId === playerAId && request.toPlayerId === playerBId) ||
      (request.fromPlayerId === playerBId && request.toPlayerId === playerAId)
    ) {
      return request;
    }
  }
  return undefined;
};

const playerHasOutgoingTruceRequest = (requests: Iterable<SocialTruceRequest>, playerId: string): boolean => {
  for (const request of requests) {
    if (request.fromPlayerId === playerId) return true;
  }
  return false;
};

const activeTruceBetween = (
  playerAId: string,
  playerBId: string,
  trucesByPair: Map<string, SocialActiveTruce>,
  now: number
): SocialActiveTruce | undefined => {
  const truce = trucesByPair.get(pairKey(playerAId, playerBId));
  return truce && truce.endsAt > now ? truce : undefined;
};

const playerHasActiveTruce = (
  playerId: string,
  trucesByPair: Map<string, SocialActiveTruce>,
  now: number
): boolean => {
  for (const truce of trucesByPair.values()) {
    if (truce.endsAt <= now) continue;
    if (truce.playerAId === playerId || truce.playerBId === playerId) return true;
  }
  return false;
};

export type SocialState = {
  registerPlayer: (playerId: string, name: string) => void;
  renamePlayer: (playerId: string, name: string) => void;
  snapshotForPlayer: (playerId: string) => SocialSnapshot;
  syncPlayers: (playerIds: string[], announcementByPlayerId?: Partial<Record<string, string>>) => SocialSyncResult;
  requestAlliance: (fromPlayerId: string, targetPlayerName: string) => SocialActionResult;
  acceptAlliance: (playerId: string, requestId: string) => SocialActionResult;
  rejectAlliance: (playerId: string, requestId: string) => SocialActionResult;
  cancelAlliance: (playerId: string, requestId: string) => SocialActionResult;
  breakAlliance: (playerId: string, targetPlayerId: string) => SocialActionResult;
  requestTruce: (fromPlayerId: string, targetPlayerName: string, durationHours: 12 | 24) => SocialActionResult;
  acceptTruce: (playerId: string, requestId: string) => SocialActionResult;
  rejectTruce: (playerId: string, requestId: string, announcementByPlayerId?: Partial<Record<string, string>>) => SocialActionResult;
  cancelTruce: (playerId: string, requestId: string) => SocialActionResult;
  breakTruce: (playerId: string, targetPlayerId: string) => SocialActionResult;
};

export type SocialStateSink = {
  upsertPlayer: (playerId: string, name: string) => void;
  saveAllianceRequest: (request: SocialAllianceRequest) => void;
  deleteAllianceRequest: (requestId: string) => void;
  saveTruceRequest: (request: SocialTruceRequest) => void;
  deleteTruceRequest: (requestId: string) => void;
  addAlliance: (playerAId: string, playerBId: string, createdAt: number) => void;
  removeAlliance: (playerAId: string, playerBId: string) => void;
  saveActiveTruce: (truce: SocialActiveTruce) => void;
  removeActiveTruce: (playerAId: string, playerBId: string) => void;
  pruneExpired: (now: number) => void;
};

export type SocialStateInitial = {
  players?: Array<{ id: string; name: string; allies?: string[] }>;
  allianceRequests?: SocialAllianceRequest[];
  truceRequests?: SocialTruceRequest[];
  activeTruces?: SocialActiveTruce[];
};

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
  const truceRequests = new Map<string, SocialTruceRequest>();
  const trucesByPair = new Map<string, SocialActiveTruce>();

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
    if (pruned) sink?.pruneExpired(current);
  };

  const snapshotForPlayer = (playerId: string): SocialSnapshot => {
    sweepExpired();
    const player = ensurePlayer(playerId);
    return {
      allies: [...player.allies],
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
        })
    };
  };

  const updatePayloadsFor = (playerIds: string[], announcementByPlayerId?: Partial<Record<string, string>>): Map<string, unknown[]> => {
    const payloads = new Map<string, unknown[]>();
    for (const playerId of playerIds) {
      const snapshot = snapshotForPlayer(playerId);
      payloads.set(playerId, [
        {
          type: "ALLIANCE_UPDATE",
          allies: snapshot.allies,
          incomingAllianceRequests: snapshot.incomingAllianceRequests,
          outgoingAllianceRequests: snapshot.outgoingAllianceRequests
        },
        {
          type: "TRUCE_UPDATE",
          activeTruces: snapshot.activeTruces,
          incomingTruceRequests: snapshot.incomingTruceRequests,
          outgoingTruceRequests: snapshot.outgoingTruceRequests,
          ...(announcementByPlayerId?.[playerId] ? { announcement: announcementByPlayerId[playerId] } : {})
        }
      ]);
    }
    return payloads;
  };

  const ok = (playerIds: string[], announcementByPlayerId?: Partial<Record<string, string>>): SocialSyncResult => ({
    ok: true,
    notifyPlayerIds: playerIds,
    payloadsByPlayerId: updatePayloadsFor(playerIds, announcementByPlayerId)
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
    for (const request of options.initial.truceRequests ?? []) {
      truceRequests.set(request.id, { ...request });
    }
    for (const truce of options.initial.activeTruces ?? []) {
      trucesByPair.set(pairKey(truce.playerAId, truce.playerBId), { ...truce });
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
      sink?.deleteAllianceRequest(requestId);
      sink?.addAlliance(actor.id, from.id, now());
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
      actor.allies.delete(target.id);
      target.allies.delete(actor.id);
      sink?.removeAlliance(actor.id, target.id);
      return ok([actor.id, target.id]);
    },
    requestTruce(fromPlayerId, targetPlayerName, durationHours) {
      sweepExpired();
      const actor = ensurePlayer(fromPlayerId);
      const target = resolveByName(targetPlayerName);
      if (!target || target.id === fromPlayerId) return { ok: false, code: "TRUCE_TARGET", message: "target not found" };
      if (playerHasActiveTruce(actor.id, trucesByPair, now())) {
        return { ok: false, code: "TRUCE_EXISTS", message: "you already have an active truce" };
      }
      if (playerHasActiveTruce(target.id, trucesByPair, now())) {
        return { ok: false, code: "TRUCE_EXISTS", message: "target already has an active truce" };
      }
      if (playerHasOutgoingTruceRequest(truceRequests.values(), actor.id)) {
        return { ok: false, code: "TRUCE_REQUEST_PENDING", message: "you already have a pending truce offer" };
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
      if (playerHasActiveTruce(actor.id, trucesByPair, now()) || playerHasActiveTruce(from.id, trucesByPair, now())) {
        truceRequests.delete(requestId);
        sink?.deleteTruceRequest(requestId);
        return { ok: false, code: "TRUCE_EXISTS", message: "one player already has an active truce" };
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
      sink?.deleteTruceRequest(requestId);
      sink?.saveActiveTruce(truce);
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
      const announcement = `${actor.name} broke the truce with ${target.name}.`;
      return ok([actor.id, target.id], { [actor.id]: announcement, [target.id]: announcement });
    }
  };
};

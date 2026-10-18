// Type definitions and pure lookup helpers for social-state.ts, split out to
// keep that file under the repo's 500-line cap. No state lives here — these
// are just the shapes createSocialState operates on plus small pure helpers
// shared by its request/truce lookups.
import type { DiplomacyTerms } from "@border-empires/shared";

import type { SocialOfferCooldown, SocialOfferKind } from "./social-offer-cooldowns.js";

export type SocialAllianceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  fromName?: string;
  toName?: string;
  /** Coin/Shards the deal moves, from the proposer's side; settled in the simulation on accept. */
  terms?: DiplomacyTerms;
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
  terms?: DiplomacyTerms;
};

export type SocialActiveTruce = {
  origin?: "court";
  playerAId: string;
  playerBId: string;
  startedAt: number;
  endsAt: number;
  createdByPlayerId: string;
};

export type SocialAllianceBreak = {
  playerAId: string;
  playerBId: string;
  startedAt: number;
  endsAt: number;
  createdByPlayerId: string;
};

export type SocialCompletedAllianceBreak = SocialAllianceBreak & {
  finalizedAt: number;
  notificationExpiresAt: number;
};

// Season-scoped record of a broken truce, kept for the rest of the season
// (unlike the short 24h truceLockoutUntilByPlayerId) so a player's profile
// can show an "oathbreaker" badge and a list of who they broke truces with.
export type SocialTruceBreakRecord = {
  targetPlayerId: string;
  targetPlayerName: string;
  brokenAt: number;
};

export type SocialSnapshot = {
  forcedTruceCooldownUntil?: number;
  allies: string[];
  activeAllianceBreaks: Array<{
    otherPlayerId: string;
    otherPlayerName: string;
    startedAt: number;
    endsAt: number;
    createdByPlayerId: string;
  }>;
  recentAllianceBreaks: Array<{
    otherPlayerId: string;
    otherPlayerName: string;
    startedAt: number;
    endsAt: number;
    finalizedAt: number;
    createdByPlayerId: string;
  }>;
  incomingAllianceRequests: SocialAllianceRequest[];
  outgoingAllianceRequests: SocialAllianceRequest[];
  incomingTruceRequests: SocialTruceRequest[];
  outgoingTruceRequests: SocialTruceRequest[];
  activeTruces: Array<{
    origin?: "court";
    otherPlayerId: string;
    otherPlayerName: string;
    startedAt: number;
    endsAt: number;
    createdByPlayerId: string;
  }>;
  truceBreaksThisSeason: SocialTruceBreakRecord[];
  /** This player's own outgoing re-offer cooldowns (see social-offer-cooldowns.ts). */
  offerCooldowns: Array<{ kind: SocialOfferKind; targetPlayerId: string; until: number }>;
};

export type SocialPlayerRecord = {
  id: string;
  name: string;
  allies: Set<string>;
};

export type SocialActionResult =
  | { ok: true; notifyPlayerIds: string[]; payloadsByPlayerId: Map<string, unknown[]> }
  | { ok: false; code: string; message: string };
export type SocialSyncResult = Extract<SocialActionResult, { ok: true }>;
export type SocialExpiredAllianceBreak = SocialAllianceBreak & { playerIds: [string, string] };

export const pairKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

export const findAllianceRequestBetweenPlayers = (
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

export const findTruceRequestBetweenPlayers = (
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

export const activeTruceBetween = (
  playerAId: string,
  playerBId: string,
  trucesByPair: Map<string, SocialActiveTruce>,
  now: number
): SocialActiveTruce | undefined => {
  const truce = trucesByPair.get(pairKey(playerAId, playerBId));
  return truce && truce.endsAt > now ? truce : undefined;
};

export const playerIsTruceLockedOut = (
  playerId: string,
  lockoutUntilByPlayerId: Map<string, number>,
  now: number
): boolean => {
  const lockoutUntil = lockoutUntilByPlayerId.get(playerId);
  return lockoutUntil !== undefined && lockoutUntil > now;
};

export type SocialRejectOptions = {
  announcementByPlayerId?: Partial<Record<string, string>>;
  /** Defaults to true; false when the decline wasn't the target's real answer (e.g. an AI that couldn't be evaluated). */
  startCooldown?: boolean;
};

export type SocialOfferOptions = {
  terms?: DiplomacyTerms;
  /** Address the target by id instead of display name (e.g. an AI's counter-offer back to the requester). */
  targetPlayerId?: string;
};

export type SocialPendingOffer =
  | { kind: "truce"; request: SocialTruceRequest }
  | { kind: "alliance"; request: SocialAllianceRequest };

export type SocialState = {
  resetAfcCampaign: () => void;
  forceTruce: (playerId: string, targetPlayerId: string) => SocialActionResult;
  registerPlayer: (playerId: string, name: string) => void;
  renamePlayer: (playerId: string, name: string) => void;
  snapshotForPlayer: (playerId: string) => SocialSnapshot;
  syncPlayers: (playerIds: string[], announcementByPlayerId?: Partial<Record<string, string>>) => SocialSyncResult;
  requestAlliance: (fromPlayerId: string, targetPlayerName: string, options?: SocialOfferOptions) => SocialActionResult;
  /** announcementByPlayerId replaces the default (none) for an accept. */
  acceptAlliance: (playerId: string, requestId: string, announcementByPlayerId?: Partial<Record<string, string>>) => SocialActionResult;
  rejectAlliance: (playerId: string, requestId: string, options?: SocialRejectOptions) => SocialActionResult;
  cancelAlliance: (playerId: string, requestId: string) => SocialActionResult;
  /** announcementByPlayerId replaces the default break-notice wording (e.g. an AI explaining why it leaves). */
  breakAlliance: (playerId: string, targetPlayerId: string, announcementByPlayerId?: Partial<Record<string, string>>) => SocialActionResult;
  expiredAllianceBreaks: () => SocialExpiredAllianceBreak[];
  finalizeExpiredAllianceBreaks: (pairs?: Array<[string, string]>) => { expiredBreaks: SocialExpiredAllianceBreak[]; payloadsByPlayerId: Map<string, unknown[]> };
  requestTruce: (fromPlayerId: string, targetPlayerName: string, durationHours: 12 | 24, options?: SocialOfferOptions) => SocialActionResult;
  /**
   * Locks an incoming offer that carries terms while the simulation moves
   * the coin/Shards: cancel/reject/expiry leave it alone until endSettlement,
   * so the payment can never land without the agreement it paid for.
   */
  beginSettlement: (
    kind: "truce" | "alliance",
    playerId: string,
    requestId: string
  ) => { ok: true; offer: SocialPendingOffer } | { ok: false; code: string; message: string };
  endSettlement: (requestId: string) => void;
  resolvePlayerByName: (playerName: string) => { id: string; name: string } | undefined;
  playerNameOf: (playerId: string) => string;
  /** announcementByPlayerId replaces the default "X and Y agreed to a truce." */
  acceptTruce: (playerId: string, requestId: string, announcementByPlayerId?: Partial<Record<string, string>>) => SocialActionResult;
  rejectTruce: (playerId: string, requestId: string, options?: SocialRejectOptions) => SocialActionResult;
  cancelTruce: (playerId: string, requestId: string) => SocialActionResult;
  breakTruce: (playerId: string, targetPlayerId: string) => SocialActionResult;
  activeTrucePairs: () => Array<[string, string]>; // non-expired pairs; sweeps first, used to sync natural expirations
};

export type SocialStateSink = {
  upsertPlayer: (playerId: string, name: string) => void;
  saveAllianceRequest: (request: SocialAllianceRequest) => void;
  deleteAllianceRequest: (requestId: string) => void;
  saveTruceRequest: (request: SocialTruceRequest) => void;
  deleteTruceRequest: (requestId: string) => void;
  addAlliance: (playerAId: string, playerBId: string, createdAt: number) => void;
  removeAlliance: (playerAId: string, playerBId: string) => void;
  saveAllianceBreak: (notice: SocialAllianceBreak) => void;
  removeAllianceBreak: (playerAId: string, playerBId: string) => void;
  saveCompletedAllianceBreak: (notice: SocialCompletedAllianceBreak) => void;
  removeCompletedAllianceBreak: (playerAId: string, playerBId: string) => void;
  saveActiveTruce: (truce: SocialActiveTruce) => void;
  saveForcedTruce: (truce: SocialActiveTruce, cooldownUntil: number) => void;
  removeActiveTruce: (playerAId: string, playerBId: string) => void;
  saveTruceLockout: (playerId: string, lockoutUntil: number) => void;
  saveTruceBreak: (playerId: string, record: SocialTruceBreakRecord) => void;
  saveOfferCooldown: (cooldown: SocialOfferCooldown) => void;
  pruneExpired: (now: number) => void;
};

export type SocialStateInitial = {
  forcedTruceCooldowns?: Array<{ playerId: string; cooldownUntil: number }>;
  players?: Array<{ id: string; name: string; allies?: string[] }>;
  allianceRequests?: SocialAllianceRequest[];
  activeAllianceBreaks?: SocialAllianceBreak[];
  completedAllianceBreaks?: SocialCompletedAllianceBreak[];
  truceRequests?: SocialTruceRequest[];
  activeTruces?: SocialActiveTruce[];
  truceLockouts?: Array<{ playerId: string; lockoutUntil: number }>;
  truceBreaks?: Array<{ playerId: string } & SocialTruceBreakRecord>;
  offerCooldowns?: SocialOfferCooldown[];
};

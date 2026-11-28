import type { TreatySettlementPhase } from "./social-offer-settlement-state.js";
import type { ResourceTradeOfferStore } from "../resource-trade/resource-trade-store.js";
// Type definitions and pure lookup helpers for social-state.ts, split out to
// keep that file under the repo's 500-line cap. No state lives here — these
// are just the shapes createSocialState operates on plus small pure helpers
// shared by its request/truce lookups.
import type { PersonalActivityDiplomacyCard } from "@border-empires/game-domain";
import type { AllianceFealty, DiplomacyTerms } from "@border-empires/shared";

import type { SocialOfferCooldown, SocialOfferKind } from "./social-offer-cooldowns.js";
import type { DiplomacyHistoryEntry, StoredDiplomacyHistoryEntry } from "./social-diplomacy-history.js";

export type SocialAllianceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  fromName?: string;
  toName?: string;
  /** Coin the deal moves, from the proposer's side; settled in the simulation on accept. */
  terms?: DiplomacyTerms;
  /** The proposer's note, cleaned (diplomacy-offer-notes.ts); not persisted with the offer, so lost on a gateway restart (its Chronicle row keeps it). */
  note?: string;
  settlementPhase?: TreatySettlementPhase;
  /** Who was liege when the offer was sent (alliance-fealty.ts in shared); absent on offers from before it was recorded. */
  fealty?: AllianceFealty;
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
  /** Sent while a truce was already running: accepting adds durationHours to its end. */
  extendsTruce?: true;
  /** The proposer's note, cleaned (diplomacy-offer-notes.ts); not persisted with the offer, so lost on a gateway restart (its Chronicle row keeps it). */
  note?: string;
  settlementPhase?: TreatySettlementPhase;
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
  resourceTradeOffers?: readonly import("@border-empires/shared").ResourceTradeOffer[];
  forcedTruceCooldownUntil?: number;
  allies: string[];
  /** Each ally's recorded fealty, keyed by ally id; an alliance from before it was recorded has no entry. */
  allianceFealty: Record<string, AllianceFealty>;
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
  /** requestId: the offer a DIPLOMACY_OFFER_WITHDRAWN refers to, so the client drops it at once. */
  | { ok: false; code: string; message: string; requestId?: string };
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
  /** Defaults to true; false when it isn't a "no" (a counter-offer, a failed payment), so the Chronicle logs no decline. */
  recordDecline?: boolean;
  /**
   * A counter-offer: ends the rejecting player's own re-offer cooldown of this kind toward the
   * offer's sender, so a cooldown from their earlier refused offer can't block answering this one.
   */
  waiveOwnCooldown?: SocialOfferKind;
};

export type SocialOfferOptions = {
  terms?: DiplomacyTerms;
  /** Cleaned by offerOptionsFor (cleanOfferNote in shared). */
  note?: string;
  /** Address the target by id instead of display name (e.g. an AI's counter-offer back to the requester). */
  targetPlayerId?: string;
};

export type SocialPendingOffer =
  | { kind: "truce"; request: SocialTruceRequest }
  | { kind: "alliance"; request: SocialAllianceRequest };

export type SocialState = {
  truceLockoutUntil: (playerId: string) => number;
  resourceTradeOffers: ResourceTradeOfferStore;
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
  /** announcementByPlayerId: a line for the server withdrawing the offer (withdrawnOfferAnnouncements); none for the sender's own withdraw. */
  cancelAlliance: (playerId: string, requestId: string, announcementByPlayerId?: Partial<Record<string, string>>) => SocialActionResult;
  /** announcementByPlayerId replaces the default break-notice wording (e.g. an AI explaining why it leaves). */
  breakAlliance: (playerId: string, targetPlayerId: string, announcementByPlayerId?: Partial<Record<string, string>>) => SocialActionResult;
  expiredAllianceBreaks: () => SocialExpiredAllianceBreak[];
  finalizeExpiredAllianceBreaks: (pairs?: Array<[string, string]>) => { expiredBreaks: SocialExpiredAllianceBreak[]; payloadsByPlayerId: Map<string, unknown[]> };
  requestTruce: (fromPlayerId: string, targetPlayerName: string, durationHours: 12 | 24, options?: SocialOfferOptions) => SocialActionResult;
  /**
   * Locks an incoming offer that carries terms while the simulation moves
   * the coin: cancel/reject/expiry leave it alone until endSettlement,
   * so the payment can never land without the agreement it paid for.
   */
  beginSettlement: (
    kind: "truce" | "alliance",
    playerId: string,
    requestId: string
  ) => { ok: true; offer: SocialPendingOffer } | { ok: false; code: string; message: string };
  endSettlement: (requestId: string) => void;
  setSettlementPhase: (kind: "truce" | "alliance", requestId: string, phase: TreatySettlementPhase) => void;
  discardSettlement: (kind: "truce" | "alliance", requestId: string) => SocialActionResult;
  isTreatySupplySettling: (agreementId: string, actorId: string) => boolean;
  resolvePlayerByName: (playerName: string) => { id: string; name: string } | undefined;
  resolvePlayerById: (playerId: string) => { id: string; name: string } | undefined;
  playerNameOf: (playerId: string) => string;
  /** announcementByPlayerId replaces the default "X and Y agreed to a truce." */
  acceptTruce: (playerId: string, requestId: string, announcementByPlayerId?: Partial<Record<string, string>>) => SocialActionResult;
  rejectTruce: (playerId: string, requestId: string, options?: SocialRejectOptions) => SocialActionResult;
  cancelTruce: (playerId: string, requestId: string, announcementByPlayerId?: Partial<Record<string, string>>) => SocialActionResult;
  breakTruce: (playerId: string, targetPlayerId: string) => SocialActionResult;
  /** Recent truce/alliance changes for the Chronicle timeline (social-diplomacy-history.ts). */
  diplomacyActivityCards: (playerId: string, from: number, to: number) => PersonalActivityDiplomacyCard[];
  activeTrucePairs: () => Array<[string, string]>; // non-expired pairs; sweeps first, used to sync natural expirations
  /** When the running truce between the pair ends, or undefined when there is none. */
  activeTruceEndsAt: (playerAId: string, playerBId: string) => number | undefined;
  /** Copies of every running truce (sweeps first); drives the truce-ending email. */
  activeTruces: () => SocialActiveTruce[];
  /** Withdraws pending truce offers between two players who just fought; undefined when there were none. */
  withdrawTruceOffersOnCombat: (playerAId: string, playerBId: string) => SocialSyncResult | undefined;
  /**
   * Fresh update payloads for every player whose truce offer was dropped
   * without telling them (expiry, or a failed accept that deleted it), then
   * forgets them. Undefined when nobody is waiting on one.
   */
  takeStaleOfferSync: () => SocialSyncResult | undefined;
  /**
   * How new alliance offers record fealty (sender, target): wired once the
   * season leaderboard is available. Unset, offers record near-equals.
   */
  setFealtyLookup: (lookup: SocialFealtyLookup) => void;
};

export type SocialFealtyLookup = (fromPlayerId: string, toPlayerId: string) => AllianceFealty;

export type SocialStateSink = {
  upsertPlayer: (playerId: string, name: string) => void;
  commitAcceptedAlliance?: (requestId: string, playerAId: string, playerBId: string, createdAt: number, fealty?: AllianceFealty) => void;
  commitAcceptedTruce?: (requestId: string, truce: SocialActiveTruce) => void;
  saveAllianceRequest: (request: SocialAllianceRequest) => void;
  deleteAllianceRequest: (requestId: string) => void;
  saveTruceRequest: (request: SocialTruceRequest) => void;
  deleteTruceRequest: (requestId: string) => void;
  addAlliance: (playerAId: string, playerBId: string, createdAt: number, fealty?: AllianceFealty) => void;
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
  /** One player's Chronicle row (social-diplomacy-history.ts); the store keeps the last day, capped per player. */
  saveDiplomacyHistory: (playerId: string, entry: DiplomacyHistoryEntry) => void;
  pruneExpired: (now: number) => void;
};

export type SocialStateInitial = {
  forcedTruceCooldowns?: Array<{ playerId: string; cooldownUntil: number }>;
  players?: Array<{ id: string; name: string; allies?: string[] }>;
  /** The alliances' recorded fealty (same pairs as players[].allies). */
  allianceRecords?: Array<{ playerAId: string; playerBId: string; fealty?: AllianceFealty }>;
  allianceRequests?: SocialAllianceRequest[];
  activeAllianceBreaks?: SocialAllianceBreak[];
  completedAllianceBreaks?: SocialCompletedAllianceBreak[];
  truceRequests?: SocialTruceRequest[];
  activeTruces?: SocialActiveTruce[];
  truceLockouts?: Array<{ playerId: string; lockoutUntil: number }>;
  truceBreaks?: Array<{ playerId: string } & SocialTruceBreakRecord>;
  offerCooldowns?: SocialOfferCooldown[];
  diplomacyHistory?: StoredDiplomacyHistoryEntry[];
};

/**
 * Who hears about a declined offer. An AI's answer brings its own wording (with
 * its reason); a human's decline used to reach the sender as a silent list
 * update, so they only learned of it from the re-offer cooldown. Keeps the word
 * "declined": the client picks the warn tone and the popup title off it.
 */
export const declinedOfferAnnouncements = (
  request: { fromPlayerId: string; durationHours?: number },
  declinerName: string,
  given: Partial<Record<string, string>> | undefined
): Partial<Record<string, string>> =>
  given ?? { [request.fromPlayerId]: `${declinerName} declined your ${request.durationHours ? `${request.durationHours}h truce` : "alliance"} offer.` };

/**
 * The line the recipient gets when the server takes an offer back on the
 * sender's behalf (an AI's offer that no longer suits it): "Maren withdrew
 * the truce offer." Playtest run 5 (pt-predator): the Accept tap only said
 * "Action failed"; the offer now leaves the bar with this line in the feed.
 */
export const withdrawnOfferAnnouncements = (
  kind: "truce" | "alliance",
  request: { toPlayerId: string },
  senderName: string
): Partial<Record<string, string>> => ({ [request.toPlayerId]: `${senderName} withdrew the ${kind} offer.` });

/** Both Houses hear about a new alliance; before, a human's accept told the proposer nothing (playtest 2026-11-16). */
export const acceptedAllianceAnnouncements = (
  proposer: { id: string; name: string },
  accepter: { id: string; name: string },
  given: Partial<Record<string, string>> | undefined
): Partial<Record<string, string>> =>
  given ?? { [proposer.id]: `${accepter.name} accepted your alliance offer.`, [accepter.id]: `You accepted ${proposer.name}'s alliance offer.` };

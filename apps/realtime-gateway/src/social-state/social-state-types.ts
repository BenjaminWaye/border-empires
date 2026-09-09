// Type definitions and pure lookup helpers for social-state.ts, split out to
// keep that file under the repo's 500-line cap. No state lives here — these
// are just the shapes createSocialState operates on plus small pure helpers
// shared by its request/truce lookups.

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
    otherPlayerId: string;
    otherPlayerName: string;
    startedAt: number;
    endsAt: number;
    createdByPlayerId: string;
  }>;
  truceBreaksThisSeason: SocialTruceBreakRecord[];
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
  expiredAllianceBreaks: () => SocialExpiredAllianceBreak[];
  finalizeExpiredAllianceBreaks: (pairs?: Array<[string, string]>) => { expiredBreaks: SocialExpiredAllianceBreak[]; payloadsByPlayerId: Map<string, unknown[]> };
  requestTruce: (fromPlayerId: string, targetPlayerName: string, durationHours: 12 | 24) => SocialActionResult;
  acceptTruce: (playerId: string, requestId: string) => SocialActionResult;
  rejectTruce: (playerId: string, requestId: string, announcementByPlayerId?: Partial<Record<string, string>>) => SocialActionResult;
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
  removeActiveTruce: (playerAId: string, playerBId: string) => void;
  saveTruceLockout: (playerId: string, lockoutUntil: number) => void;
  saveTruceBreak: (playerId: string, record: SocialTruceBreakRecord) => void;
  pruneExpired: (now: number) => void;
};

export type SocialStateInitial = {
  players?: Array<{ id: string; name: string; allies?: string[] }>;
  allianceRequests?: SocialAllianceRequest[];
  activeAllianceBreaks?: SocialAllianceBreak[];
  completedAllianceBreaks?: SocialCompletedAllianceBreak[];
  truceRequests?: SocialTruceRequest[];
  activeTruces?: SocialActiveTruce[];
  truceLockouts?: Array<{ playerId: string; lockoutUntil: number }>;
  truceBreaks?: Array<{ playerId: string } & SocialTruceBreakRecord>;
};

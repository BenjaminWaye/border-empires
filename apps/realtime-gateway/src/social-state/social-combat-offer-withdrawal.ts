// Truce offers no longer run out after a few minutes (TRUCE_REQUEST_TTL_MS is a
// week-long cleanup backstop), so a player can answer one after logging back
// in. What keeps an old offer from becoming a panic button -- accepted
// mid-war on terms given in peacetime -- is this: any combat between the two
// players withdraws every pending truce offer between them, in both directions.
import type { SocialPlayerRecord, SocialStateSink, SocialSyncResult, SocialTruceRequest } from "./social-state-types.js";

export type CombatOfferWithdrawalDeps = {
  truceRequests: Map<string, SocialTruceRequest>;
  /** Offers being paid out right now finish; they are not withdrawn. */
  settlingRequestIds: ReadonlySet<string>;
  sink?: Pick<SocialStateSink, "deleteTruceRequest"> | undefined;
};

/** Removes the pending truce offers between the pair (either direction) and returns them. */
export const withdrawTruceOffersBetween = (deps: CombatOfferWithdrawalDeps, playerAId: string, playerBId: string): SocialTruceRequest[] => {
  const withdrawn: SocialTruceRequest[] = [];
  for (const [requestId, request] of deps.truceRequests) {
    const between =
      (request.fromPlayerId === playerAId && request.toPlayerId === playerBId) ||
      (request.fromPlayerId === playerBId && request.toPlayerId === playerAId);
    if (!between || request.settlementPhase || deps.settlingRequestIds.has(requestId)) continue;
    deps.truceRequests.delete(requestId);
    deps.sink?.deleteTruceRequest(requestId);
    withdrawn.push(request);
  }
  return withdrawn;
};

/** One line per player telling them which offer the fighting cancelled. */
export const combatWithdrawalNotices = (
  withdrawn: readonly SocialTruceRequest[],
  playersById: ReadonlyMap<string, Pick<SocialPlayerRecord, "name">>
): Partial<Record<string, string>> => {
  const nameOf = (playerId: string): string => playersById.get(playerId)?.name ?? playerId;
  const notices: Partial<Record<string, string>> = {};
  const add = (playerId: string, line: string): void => {
    notices[playerId] = notices[playerId] ? `${notices[playerId]} ${line}` : line;
  };
  for (const request of withdrawn) {
    add(request.fromPlayerId, `Your truce offer to ${nameOf(request.toPlayerId)} was withdrawn because your empires fought.`);
    add(request.toPlayerId, `${nameOf(request.fromPlayerId)}'s truce offer was withdrawn because your empires fought.`);
  }
  return notices;
};

/** social-state's withdrawTruceOffersOnCombat: withdraws, then builds both players' update payloads with the notices. */
export const createCombatOfferWithdrawal = (
  deps: CombatOfferWithdrawalDeps & {
    playersById: ReadonlyMap<string, Pick<SocialPlayerRecord, "name">>;
    ok: (playerIds: string[], announcementByPlayerId?: Partial<Record<string, string>>) => SocialSyncResult;
  }
) => (playerAId: string, playerBId: string): SocialSyncResult | undefined => {
  const withdrawn = withdrawTruceOffersBetween(deps, playerAId, playerBId);
  return withdrawn.length > 0 ? deps.ok([playerAId, playerBId], combatWithdrawalNotices(withdrawn, deps.playersById)) : undefined;
};

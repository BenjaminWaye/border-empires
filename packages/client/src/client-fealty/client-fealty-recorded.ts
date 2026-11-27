// Fealty as the gateway recorded it (AllianceFealty in shared), not as sizes
// stand now. Owner decision 2026-11-27: an offer keeps the wording it was sent
// with and an alliance the wording of the offer that formed it, so a polite
// offer to a House that later shrank never turns into "Fealty demanded". An
// offer or alliance from before the gateway recorded fealty has no record and
// reads plain "Alliance". Only the deal screen for a NEW offer reads live sizes
// (fealtyLookupFor in client-fealty.ts).
import { parseAllianceFealty, type AllianceFealty } from "@border-empires/shared";

import type { FealtyLookup, FealtyStanding } from "./client-fealty.js";

/** Your standing with `otherPlayerId` from a record; no record (or a liege who is neither of you) is plain alliance. */
export const recordedFealtyStanding = (record: AllianceFealty | undefined, me: string, otherPlayerId: string): FealtyStanding => {
  if (!record?.liegePlayerId) return "ALLIANCE";
  if (record.liegePlayerId === me) return "DEMAND";
  return record.liegePlayerId === otherPlayerId ? "SWEAR" : "ALLIANCE";
};

type RecordedRequest = { fromPlayerId: string; toPlayerId: string; fealty?: AllianceFealty };

export type RecordedFealtyState = {
  me: string | undefined;
  allies: readonly string[];
  /** Each ally's recorded fealty (ALLIANCE_UPDATE / INIT allianceFealty). */
  allianceFealty?: Readonly<Record<string, AllianceFealty>>;
  incomingAllianceRequests: readonly RecordedRequest[];
  outgoingAllianceRequests: readonly RecordedRequest[];
};

/**
 * Your recorded standing with each empire: the alliance's record for an ally,
 * else the pending alliance offer's (a pair has at most one), else plain.
 */
export const recordedFealtyLookupFor = (state: RecordedFealtyState): FealtyLookup => (otherPlayerId) => {
  const me = state.me ?? "";
  if (!otherPlayerId || !me || otherPlayerId === me) return "ALLIANCE";
  if (state.allies.includes(otherPlayerId)) return recordedFealtyStanding(state.allianceFealty?.[otherPlayerId], me, otherPlayerId);
  const request =
    state.incomingAllianceRequests.find((r) => r.fromPlayerId === otherPlayerId) ??
    state.outgoingAllianceRequests.find((r) => r.toPlayerId === otherPlayerId);
  return recordedFealtyStanding(request?.fealty, me, otherPlayerId);
};

/** An INIT / ALLIANCE_UPDATE allianceFealty field; missing (an older gateway) or malformed entries are dropped. */
export const allianceFealtyFromMessage = (value: unknown): Record<string, AllianceFealty> => {
  const byAlly: Record<string, AllianceFealty> = {};
  if (typeof value !== "object" || value === null) return byAlly;
  for (const [allyId, raw] of Object.entries(value)) {
    const fealty = parseAllianceFealty(raw);
    if (fealty) byAlly[allyId] = fealty;
  }
  return byAlly;
};

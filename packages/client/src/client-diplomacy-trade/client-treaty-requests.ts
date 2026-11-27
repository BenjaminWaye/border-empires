import type { AllianceFealty, DiplomacyTerms, OfferNoteId } from "@border-empires/shared";

export type AllianceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt?: number;
  fromName?: string;
  toName?: string;
  /** Coin and supply the deal moves, from the proposer's side. */
  terms?: DiplomacyTerms;
  /** A preset line the sender attached (diplomacy-offer-notes.ts in shared). */
  note?: OfferNoteId;
  settlementPhase?: "paying" | "refunding";
  /** Who was liege when the offer was sent (client-fealty-recorded.ts); absent on older offers. */
  fealty?: AllianceFealty;
};

export type TruceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
  durationHours: 12 | 24;
  extendsTruce?: true;
  fromName?: string;
  toName?: string;
  terms?: DiplomacyTerms;
  /** A preset line the sender attached (diplomacy-offer-notes.ts in shared). */
  note?: OfferNoteId;
  settlementPhase?: "paying" | "refunding";
};

/**
 * When a new truce offered by `request` would end if accepted: its clock runs from the offer
 * (gateway offeredTruceEndsAt), so a 12h offer answered 10h later gives 2h. Undefined for extensions,
 * which add their hours to the running truce.
 */
export const offeredTruceEndsAt = (request: Pick<TruceRequest, "createdAt" | "durationHours" | "extendsTruce">): number | undefined =>
  request.extendsTruce ? undefined : request.createdAt + request.durationHours * 3_600_000;

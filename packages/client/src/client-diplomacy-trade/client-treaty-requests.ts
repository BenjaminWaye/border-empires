import type { DiplomacyTerms } from "@border-empires/shared";

export type AllianceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt?: number;
  fromName?: string;
  toName?: string;
  /** Coin/Shards the deal moves, from the proposer's side. */
  terms?: DiplomacyTerms;
  settlementPhase?: "paying" | "refunding";
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
  settlementPhase?: "paying" | "refunding";
};

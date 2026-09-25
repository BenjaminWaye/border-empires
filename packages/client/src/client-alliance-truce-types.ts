// Alliance/truce request and view types, extracted from client-types.ts
// (500-line source budget, see AGENTS.md) to make room for the Manifest
// tree naming/lore pass's ANCILLARY_DEPOT/RESERVE_LATTICE structure types
// without growing that already-oversized file further.

export type AllianceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt?: number;
  fromName?: string;
  toName?: string;
};

export type ActiveAllianceBreakView = {
  otherPlayerId: string;
  otherPlayerName: string;
  startedAt: number;
  endsAt: number;
  createdByPlayerId: string;
};

export type RecentAllianceBreakView = ActiveAllianceBreakView & {
  finalizedAt: number;
};

export type TruceRequest = {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  createdAt: number;
  expiresAt: number;
  durationHours: 12 | 24;
  fromName?: string;
  toName?: string;
};

export type ActiveTruceView = {
  otherPlayerId: string;
  otherPlayerName: string;
  startedAt: number;
  endsAt: number;
  createdByPlayerId: string;
};

// SQLite row types + row->domain mapper functions for SqliteGatewaySocialStore,
// extracted out of social-store.ts (already over the file-line gate's
// 500-line budget and may not grow further -- see AGENTS.md's file-and-
// type-discipline rule) since these are a clean, self-contained unit: pure
// row shapes and pure mapping functions with no store state of their own.
import type {
  SocialActiveTruce,
  SocialAllianceBreak,
  SocialAllianceRequest,
  SocialCompletedAllianceBreak,
  SocialTruceRequest
} from "../social-state/social-state.js";

export type PlayerRow = { player_id: string; name: string; updated_at: number };
export type AllianceRow = { player_a_id: string; player_b_id: string; created_at: number };
export type AllianceBreakRow = {
  pair_key: string;
  player_a_id: string;
  player_b_id: string;
  started_at: number;
  ends_at: number;
  created_by_player_id: string;
};
export type CompletedAllianceBreakRow = AllianceBreakRow & {
  finalized_at: number;
  notification_expires_at: number;
};
export type AllianceRequestRow = {
  id: string;
  from_player_id: string;
  to_player_id: string;
  created_at: number;
  from_name: string | null;
  to_name: string | null;
};
export type TruceRequestRow = {
  id: string;
  from_player_id: string;
  to_player_id: string;
  created_at: number;
  expires_at: number;
  duration_hours: number;
  from_name: string | null;
  to_name: string | null;
};
export type ActiveTruceRow = {
  pair_key: string;
  player_a_id: string;
  player_b_id: string;
  started_at: number;
  ends_at: number;
  created_by_player_id: string;
};
export type TruceLockoutRow = { player_id: string; lockout_until: number };

export const allianceRequestFromRow = (row: AllianceRequestRow): SocialAllianceRequest => ({
  id: row.id,
  fromPlayerId: row.from_player_id,
  toPlayerId: row.to_player_id,
  createdAt: row.created_at,
  ...(row.from_name ? { fromName: row.from_name } : {}),
  ...(row.to_name ? { toName: row.to_name } : {})
});

export const allianceBreakFromRow = (row: AllianceBreakRow): SocialAllianceBreak => ({
  playerAId: row.player_a_id,
  playerBId: row.player_b_id,
  startedAt: row.started_at,
  endsAt: row.ends_at,
  createdByPlayerId: row.created_by_player_id
});

export const completedAllianceBreakFromRow = (row: CompletedAllianceBreakRow): SocialCompletedAllianceBreak => ({
  ...allianceBreakFromRow(row),
  finalizedAt: row.finalized_at,
  notificationExpiresAt: row.notification_expires_at
});

export const truceRequestFromRow = (row: TruceRequestRow): SocialTruceRequest => ({
  id: row.id,
  fromPlayerId: row.from_player_id,
  toPlayerId: row.to_player_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  durationHours: row.duration_hours as 12 | 24,
  ...(row.from_name ? { fromName: row.from_name } : {}),
  ...(row.to_name ? { toName: row.to_name } : {})
});

export const activeTruceFromRow = (row: ActiveTruceRow): SocialActiveTruce => ({
  playerAId: row.player_a_id,
  playerBId: row.player_b_id,
  startedAt: row.started_at,
  endsAt: row.ends_at,
  createdByPlayerId: row.created_by_player_id
});

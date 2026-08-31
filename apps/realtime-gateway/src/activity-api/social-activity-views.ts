// Read-only adapters from the gateway's persisted SocialStoreSnapshot
// (social-store.ts) into the GET /api/activity response shapes (see
// packages/game-domain/src/activity-dashboard-types.ts). Pure mapping only
// -- no mutation, no new stores.
import type {
  SocialAllianceBreakView,
  SocialAlliancePairView,
  SocialTruceWatchView
} from "@border-empires/game-domain";

import type { SocialStoreSnapshot } from "../social-store/social-store.js";

export const activeAlliancesView = (snapshot: SocialStoreSnapshot): SocialAlliancePairView[] =>
  snapshot.allianceRecords
    .map(({ playerAId, playerBId, createdAt }) => ({ playerA: playerAId, playerB: playerBId, since: createdAt }))
    .sort((a, b) => a.since - b.since);

// `activeAllianceBreaks` (not `completedAllianceBreaks`) is the right source
// for this view: an active break is still inside its 24h notice window
// (ALLIANCE_BREAK_NOTICE_MS, social-state.ts) where the pair is no longer
// allied but combat/etc protections haven't lifted yet -- exactly what
// `noticeEndsAt` communicates. A `completedAllianceBreak` has already fully
// resolved and is only retained for the requesting player's own "recent
// activity" notification feed (7-day TTL), not global public activity.
export const allianceBreaksView = (snapshot: SocialStoreSnapshot): SocialAllianceBreakView[] =>
  snapshot.activeAllianceBreaks
    .map((notice) => ({
      playerA: notice.playerAId,
      playerB: notice.playerBId,
      brokenBy: notice.createdByPlayerId,
      brokenAt: notice.startedAt,
      noticeEndsAt: notice.endsAt
    }))
    .sort((a, b) => b.brokenAt - a.brokenAt);

// All currently-active truces, not filtered to "expiring soon" -- a public
// dashboard reader has no per-viewer context to define "soon" against, and
// the full active set is small (bounded by player count) and still useful
// as a general truce-watch list. `endsAt` already lets a client sort/filter
// down to "expiring soon" itself if it wants that.
export const truceWatchView = (snapshot: SocialStoreSnapshot): SocialTruceWatchView[] =>
  snapshot.activeTruces
    .map((truce) => ({ playerA: truce.playerAId, playerB: truce.playerBId, endsAt: truce.endsAt }))
    .sort((a, b) => a.endsAt - b.endsAt);

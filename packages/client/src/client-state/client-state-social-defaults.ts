import type {
  ActiveAllianceBreakView,
  ActiveTruceView,
  RecentAllianceBreakView
} from "../client-types.js";
import type { CareerStatsView, GalaxyHoldingsView, SocialPublicView, TruceBreakView } from "../client-player-profile/client-player-profile-types.js";

/**
 * Alliance/truce/profile client state, extracted out of client-state.ts
 * (already at the file-line cap) so new fields don't grow that file.
 * truceBreaksThisSeason is own-player-only for now -- the server's
 * SocialSnapshot is per-viewer, so other players' truce-break history isn't
 * available yet (see client-player-profile.ts).
 */
export const createInitialSocialState = () => ({
  allies: [] as string[],
  activeAllianceBreaks: [] as ActiveAllianceBreakView[],
  recentAllianceBreaks: [] as RecentAllianceBreakView[],
  activeTruces: [] as ActiveTruceView[],
  truceBreaksThisSeason: [] as TruceBreakView[],
  activePlayerProfileId: undefined as string | undefined,
  // "loading" while a GET /hq/galaxy/by-player/:playerId fetch is in flight;
  // absent key means not yet fetched for that player this session.
  galaxyHoldingsByPlayerId: new Map<string, GalaxyHoldingsView | "loading">(),
  // Same lifecycle/caching semantics as galaxyHoldingsByPlayerId above, for
  // GET /hq/career/by-player/:playerId.
  careerStatsByPlayerId: new Map<string, CareerStatsView | "loading">(),
  // Same lifecycle/caching semantics as galaxyHoldingsByPlayerId above, for
  // GET /hq/social/by-player/:playerId (current-season allies/truces).
  socialViewByPlayerId: new Map<string, SocialPublicView | "loading">()
});

import { SEASON_START_VOTE_THRESHOLD, type SeasonStartVoteTracker } from "./season-start-vote.js";

export type StartNewSeasonMessageDeps = {
  playerId: string | undefined;
  // Server-side admin gate (ADMIN_EMAIL, see canToggleFogForEmail). Only
  // admins may force-start; the client hides the long-press otherwise.
  isAdmin: boolean;
  force: boolean;
  seasonStartVote: SeasonStartVoteTracker;
  sendError: (code: string, message: string) => void;
  broadcastVoteUpdate: (payload: { type: "SEASON_START_VOTE_UPDATE"; voteCount: number; threshold: number; votedBy: string[] }) => void;
  startNextSeason: (force: boolean) => Promise<{ seasonId: string }>;
  onSeasonStarted: (seasonId: string, force: boolean) => void;
  recordGatewayEvent: (level: "info" | "warn", event: string, payload: Record<string, unknown>) => void;
};

// Extracted from gateway-app.ts (already over its 500-line cap). Normal path:
// record a vote and start the season once SEASON_START_VOTE_THRESHOLD is met.
// Admin force path (long-press on the season-end button): skip the vote
// threshold and start immediately, like POST /admin/season/start-next?force=1.
export const handleStartNewSeasonMessage = async (deps: StartNewSeasonMessageDeps): Promise<void> => {
  const { playerId, seasonStartVote } = deps;
  if (!playerId) { deps.sendError("NO_AUTH", "auth first"); return; }
  if (deps.force) {
    if (!deps.isAdmin) {
      deps.recordGatewayEvent("warn", "gateway_force_start_new_season_forbidden", { playerId });
      deps.sendError("FORBIDDEN", "only admins can force-start a season");
      return;
    }
    deps.recordGatewayEvent("info", "gateway_force_start_new_season", { playerId, votes: seasonStartVote.getCount() });
  } else {
    if (seasonStartVote.hasVoted(playerId)) { deps.sendError("ALREADY_VOTED", "already voted"); return; }
    const { count, thresholdMet } = seasonStartVote.vote(playerId);
    deps.recordGatewayEvent("info", "gateway_start_new_season_vote", { playerId, count });
    deps.broadcastVoteUpdate({ type: "SEASON_START_VOTE_UPDATE", voteCount: count, threshold: SEASON_START_VOTE_THRESHOLD, votedBy: [...seasonStartVote.getVoters()] });
    if (!thresholdMet) return;
  }
  try {
    const result = await deps.startNextSeason(deps.force);
    deps.onSeasonStarted(result.seasonId, deps.force);
  } catch (error) {
    deps.recordGatewayEvent("warn", "gateway_start_new_season_rejected", { playerId, force: deps.force, error: error instanceof Error ? error.message : String(error) });
    deps.sendError("SEASON_NOT_READY", "A new Sector Contest cannot start yet.");
  }
};

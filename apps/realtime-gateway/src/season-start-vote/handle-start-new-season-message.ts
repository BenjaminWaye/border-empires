import type { NextContest } from "../next-contest/next-contest.js";

export type StartNewSeasonMessageDeps = {
  playerId: string | undefined;
  isGuest: boolean;
  // Server-side admin gate: ADMIN_EMAIL match (canToggleFogForEmail) AND a
  // verified email, since Firebase lets anyone register an unverified
  // address. The client hides the long-press for non-admins.
  isAdmin: boolean;
  force: boolean;
  nextContest: Pick<NextContest, "commit" | "forceStart" | "isStarting">;
  sendError: (code: string, message: string) => void;
  recordGatewayEvent: (level: "info" | "warn", event: string, payload: Record<string, unknown>) => void;
};

// Extracted from gateway-app.ts (already over its 500-line cap). Normal path:
// commit this House to the next Sector Contest, which starts once enough
// have committed (see next-contest.ts). Admin force path (long-press on the
// season-end button): start it now -- but only once the season has ended.
export const handleStartNewSeasonMessage = async (deps: StartNewSeasonMessageDeps): Promise<void> => {
  const { playerId } = deps;
  if (!playerId) { deps.sendError("NO_AUTH", "auth first"); return; }
  try {
    if (deps.force) {
      if (!deps.isAdmin) {
        deps.recordGatewayEvent("warn", "gateway_force_start_new_season_forbidden", { playerId });
        deps.sendError("FORCE_START_FORBIDDEN", "Only the admin account, signed in with a verified email, can force-start the next Sector Contest.");
        return;
      }
      // A repeat press while the world is already being built is not an
      // error: every client was told the start is under way.
      if (deps.nextContest.isStarting()) return;
      deps.recordGatewayEvent("info", "gateway_force_start_new_season", { playerId });
      if (!(await deps.nextContest.forceStart()) && !deps.nextContest.isStarting()) deps.sendError("SEASON_NOT_READY", "A new Sector Contest cannot start yet.");
      return;
    }
    const result = await deps.nextContest.commit(playerId, deps.isGuest);
    if (!result.ok) { deps.sendError(result.code, result.message); return; }
    deps.recordGatewayEvent("info", "gateway_next_contest_committed", { playerId, count: result.count, started: result.started });
  } catch (error) {
    deps.recordGatewayEvent("warn", "gateway_start_new_season_rejected", { playerId, force: deps.force, error: error instanceof Error ? error.message : String(error) });
    deps.sendError("SEASON_NOT_READY", "A new Sector Contest cannot start yet.");
  }
};

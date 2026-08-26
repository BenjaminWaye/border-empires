// Builds the SEASON_PENDING rejection sent to a socket whose JoinSeason hit
// a season that hasn't reached its scheduledStartAt yet (see
// maybeActivatePendingSeason in the simulation and joinSeasonHandler in
// prepare-and-join-player.ts). Modeled on season-full-rejection.ts. Kept
// separate from gateway-app.ts so that file doesn't grow past its line cap.
export const seasonPendingErrorPayload = (
  scheduledStartAt: number
): { type: "ERROR"; code: "SEASON_PENDING"; message: string; scheduledStartAt: number } => ({
  type: "ERROR",
  code: "SEASON_PENDING",
  message: "This season hasn't started yet. Hang tight for the countdown.",
  scheduledStartAt
});

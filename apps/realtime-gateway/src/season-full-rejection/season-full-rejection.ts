// Builds the SEASON_FULL rejection sent to a socket whose PreparePlayer was
// turned away by the simulation's join-capacity gate (see PreparePlayer in
// simulation-service.ts). Kept separate from gateway-app.ts so that file
// doesn't grow past its line cap for a one-shot payload.
export const seasonFullErrorPayload = (): { type: "ERROR"; code: "SEASON_FULL"; message: string } => ({
  type: "ERROR",
  code: "SEASON_FULL",
  message: "This season's empire slots are full. We'll email you when the next season begins."
});

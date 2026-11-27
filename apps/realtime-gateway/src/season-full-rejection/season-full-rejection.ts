// Builds the SEASON_FULL rejection sent to a socket whose PreparePlayer was
// turned away by the simulation's join-capacity gate (see PreparePlayer in
// simulation-service.ts). Kept separate from gateway-app.ts so that file
// doesn't grow past its line cap for a one-shot payload.
export const seasonFullErrorPayload = (): { type: "ERROR"; code: "SEASON_FULL"; message: string } => ({
  type: "ERROR",
  code: "SEASON_FULL",
  message: "This Sector Contest is full. Join the waitlist for the next Sector."
});

// Sent when a guest (Firebase anonymous account) is turned away because the
// season's guest allowance is used up. The overall cap may still have room,
// so the client should offer the normal sign-in options instead.
export const guestSlotsFullErrorPayload = (): { type: "ERROR"; code: "GUEST_SLOTS_FULL"; message: string } => ({
  type: "ERROR",
  code: "GUEST_SLOTS_FULL",
  message: "Guest spots for this Sector Contest are full. Sign in to claim an empire."
});

// Sent when JoinSeason turned a new player away because the map has no
// viable landing site left (GDD §6). `reserved`: the player's place in the
// next contest was recorded on the next-Sector waitlist. A hosted sector has
// no next contest, so nothing is reserved there.
export const noLandingSiteErrorPayload = (
  reserved: boolean
): { type: "ERROR"; code: "NO_LANDING_SITE"; message: string; reserved: boolean } => ({
  type: "ERROR",
  code: "NO_LANDING_SITE",
  message: reserved
    ? "There is no free landing site left on this map, so joining is closed. Your place in the next Sector Contest is reserved."
    : "There is no free landing site left in this Sector, so joining is closed.",
  reserved
});

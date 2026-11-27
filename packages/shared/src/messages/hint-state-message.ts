import { z } from "zod";

// SET_HINT_STATE, split out of messages.ts (at the file-line limit).

/** Most met-empire ids one player keeps per season; far above any season's player count. */
export const MET_PLAYERS_MAX_IDS = 500;
export const MET_PLAYER_ID_MAX_LENGTH = 128;

// Server-persisted hint/tutorial state (see player-profile-store.ts's
// dismissedHints/hintsMuted/onboardingChecklistCompleted/musterUnlockedSeasonId). A partial
// update -- omitted fields leave the stored value unchanged.
export const SetHintStateMessageSchema = z.object({
  type: z.literal("SET_HINT_STATE"),
  dismissedHints: z.array(z.string()).optional(),
  hintsMuted: z.boolean().optional(),
  onboardingChecklistCompleted: z.boolean().optional(),
  // Season id (CurrentSeasonSummary.seasonId) mustering was last unlocked in
  // -- see player-profile-store.ts's musterUnlockedSeasonId. Per-season:
  // meeting an enemy in an earlier season does not carry the unlock into a
  // new one, since a new season is a fresh map with no enemies met yet.
  musterUnlockedSeasonId: z.string().optional(),
  // Season id (CurrentSeasonSummary.seasonId) whose first login already got
  // the quiet pass -- the Activity dashboard (What's New / Yours) is not
  // auto-opened on a season's first login. See player-profile-store.ts's
  // dashboardQuietedSeasonId.
  dashboardQuietedSeasonId: z.string().optional(),
  // New-account tutorial guide (client-tutorial-guide/): whether it is
  // running, finished or dismissed, plus the bounded list of completed
  // step ids. See player-profile-store.ts's guideStatus/guideSteps.
  guideStatus: z.enum(["active", "done", "dismissed"]).optional(),
  guideSteps: z.array(z.string().max(48)).max(64).optional(),
  // The season (CurrentSeasonSummary.seasonId) the guide state belongs to:
  // the guide restarts for every player in each new season.
  guideSeasonId: z.string().max(128).optional(),
  // "Empires you've met" (client-met-players.ts), so contact survives a
  // browser data clear or another device. The ids are the whole set for
  // metPlayersSeasonId; the gateway merges them into the stored set for that
  // season, and an empty list clears it (a regenerated world starts over).
  metPlayerIds: z.array(z.string().max(MET_PLAYER_ID_MAX_LENGTH)).max(MET_PLAYERS_MAX_IDS).optional(),
  metPlayersSeasonId: z.string().max(128).optional()
});

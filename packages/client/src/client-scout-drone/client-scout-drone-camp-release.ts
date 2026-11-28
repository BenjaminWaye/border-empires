// The guided camp flight's look (simulation scout-drone-camp-lead.ts) holds until the camp falls, which the
// simulation sees, or the player moves past the guide's First battle chapter, which only the client knows
// (owner decision 2026-11-28, PR #3063 review). So once the guide is no longer running (finished or dismissed)
// the client says SCOUT_CAMP_LEAD_DONE: once per page, and again after each later landing, since a later free
// flight leaves a new look. It only takes the player's own vision away; with no look held it is a no-op.
import type { ClientState } from "../client-state/client-state.js";
import { isGuideActive } from "../client-tutorial-guide/tutorial-guide-storage.js";

type ReleaseState = Pick<ClientState, "connection" | "authEmail" | "scoutDroneReport">;

// The landing report the last release was sent after ("" before any); undefined while the guide runs.
let releasedAfter: string | undefined;

/** Sends SCOUT_CAMP_LEAD_DONE when the guide has stopped running and nothing was said since the last landing. */
export const syncScoutCampLeadRelease = (state: ReleaseState, send: (message: { type: "SCOUT_CAMP_LEAD_DONE" }) => boolean): void => {
  if (isGuideActive(state.authEmail)) {
    releasedAfter = undefined;
    return;
  }
  // Only on a live session: the send path reports an auth error otherwise, and this retries on every render.
  if (state.connection !== "initialized") return;
  const landing = state.scoutDroneReport?.id ?? "";
  if (releasedAfter === landing) return;
  if (send({ type: "SCOUT_CAMP_LEAD_DONE" })) releasedAfter = landing;
};

export const resetScoutCampLeadReleaseForTests = (): void => {
  releasedAfter = undefined;
};

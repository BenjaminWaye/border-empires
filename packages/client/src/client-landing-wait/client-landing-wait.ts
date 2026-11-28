// "Your House is waiting for a free landing site." On a full map a knocked-out
// House stays landless until a viable site frees up (owner decision 2026-11-27);
// the simulation then lands it within about a minute while its player is
// online (land-waiting-houses.ts). Shown once the player has been in the
// contest with no land for LANDING_WAIT_DELAY_MS, so a map still loading does
// not flash it.
import "./client-landing-wait.css";

const NOTICE_ID = "landing-wait-notice";
export const LANDING_WAIT_DELAY_MS = 15_000;
export const LANDING_WAIT_TEXT = "Your House is waiting for a free landing site. It lands automatically as soon as one opens.";

export type LandingWaitState = {
  me: string;
  authSessionReady: boolean;
  needsSeasonJoin: boolean;
  seasonPending: boolean;
  hasOwnedTileInCache: boolean;
  seasonWinner?: unknown;
};

const isLandless = (state: LandingWaitState): boolean =>
  Boolean(state.me) && state.authSessionReady && !state.needsSeasonJoin && !state.seasonPending && !state.seasonWinner && !state.hasOwnedTileInCache;

// One slot for this page: when the player last became landless.
let landlessSince: number | undefined;

export const resetLandingWaitForTests = (): void => {
  landlessSince = undefined;
};

export const shouldShowLandingWait = (state: LandingWaitState, now: number): boolean => {
  if (!isLandless(state)) {
    landlessSince = undefined;
    return false;
  }
  landlessSince ??= now;
  return now - landlessSince >= LANDING_WAIT_DELAY_MS;
};

export const syncLandingWaitNotice = (state: LandingWaitState, now: number = Date.now(), doc: Document | undefined = typeof document === "undefined" ? undefined : document): void => {
  if (!doc) return;
  const existing = doc.getElementById(NOTICE_ID);
  if (!shouldShowLandingWait(state, now)) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const notice = doc.createElement("div");
  notice.id = NOTICE_ID;
  notice.className = "landing-wait-notice";
  notice.setAttribute("role", "status");
  notice.textContent = LANDING_WAIT_TEXT;
  (doc.getElementById("hud") ?? doc.body).append(notice);
};

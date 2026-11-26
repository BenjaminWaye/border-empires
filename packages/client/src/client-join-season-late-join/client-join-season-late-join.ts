// The honest join card (GDD §6, "Join at any time, with an honest warning"):
// a running Sector Contest states its day, the manpower a new House lands
// with, and that difficulty is high, and offers waiting for the next contest
// instead. "No landing site, no join": NO_LANDING_SITE closes joining, and
// the gateway reserves the player's place in the next contest.
import { LANDING_MANPOWER_RESERVE, landingManpowerReserve } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LateJoinFacts = {
  /** Day of the contest, counting from 1. */
  day: number;
  /** One-time landing manpower: the base reserve plus the late-join catch-up. */
  landingManpower: number;
  /** The catch-up part alone (manpower a one-town empire regenerated since the start). */
  catchUp: number;
};

/** Undefined when the start time is unknown (an older gateway, or a contest not running). */
export const lateJoinFacts = (nowMs: number, seasonStartedAt: number): LateJoinFacts | undefined => {
  if (!Number.isFinite(seasonStartedAt) || seasonStartedAt <= 0) return undefined;
  // Same formula the simulation grants with (landingManpowerReserve), so the card never promises more.
  const landingManpower = landingManpowerReserve(nowMs, seasonStartedAt);
  return {
    day: Math.floor(Math.max(0, nowMs - seasonStartedAt) / DAY_MS) + 1,
    landingManpower,
    catchUp: landingManpower - LANDING_MANPOWER_RESERVE
  };
};

const formatCount = (value: number): string => Math.round(value).toLocaleString("en-US");

/** The warning shown above the Land button. */
export const lateJoinWarningHtml = (facts: LateJoinFacts | undefined, singleContest: boolean): string => {
  const dayLine = facts ? `<p class="respawn-summary">This Sector Contest is on <strong>day ${facts.day}</strong>.</p>` : "";
  const bonusLine = facts
    ? `<p class="respawn-summary">You land with <strong>${formatCount(facts.landingManpower)} extra manpower</strong>${
        facts.catchUp > 0 ? ` (${formatCount(LANDING_MANPOWER_RESERVE)} landing reserve plus ${formatCount(facts.catchUp)} for the time you missed)` : ""
      }.</p>`
    : "";
  const waitLine = singleContest ? "" : " You can wait for the next Sector Contest instead.";
  return `${dayLine}${bonusLine}<p class="respawn-summary"><strong>Difficulty: high.</strong> The Houses already here have had time to dig in. You will have to fight tooth and nail to hold ground.${waitLine}</p>`;
};

/** The second button on the join card: wait for the next contest (or, on a hosted sector, simply not now). */
export const waitButtonHtml = (singleContest: boolean): string =>
  `<button id="join-season-wait" class="panel-btn" type="button">${singleContest ? "Not now" : "Wait for the next contest"}</button>`;

/** The card shown once joining is closed for lack of a landing site. */
export const joinClosedHtml = (message: string): string => `
    <div class="respawn-backdrop" id="join-season-backdrop"></div>
    <div class="respawn-modal card" role="dialog" aria-modal="true" aria-labelledby="join-season-title">
      <button id="join-season-close" class="guide-close-btn" type="button" aria-label="Close">×</button>
      <div class="respawn-modal-scroll">
        <div class="respawn-kicker">Sector Contest</div>
        <h2 id="join-season-title" class="respawn-title">No landing site left</h2>
        <p class="respawn-summary">${message}</p>
      </div>
    </div>
  `;

/** INIT fields for the join card. Absent fields (older gateways) leave the card without day and bonus lines. */
export const applyInitJoinScreenFields = (
  state: Pick<ClientState, "seasonStartedAt" | "singleContest" | "joinSeasonClosedMessage">,
  msg: Record<string, unknown>
): void => {
  state.seasonStartedAt = typeof msg.seasonStartedAt === "number" && Number.isFinite(msg.seasonStartedAt) ? msg.seasonStartedAt : 0;
  state.singleContest = msg.singleContest === true;
  state.joinSeasonClosedMessage = "";
};

const NO_LANDING_SITE_FALLBACK = "There is no free landing site left on this map, so joining is closed.";

/** NO_LANDING_SITE reply to JOIN_SEASON: keep the card up, switched to the closed message. Returns true when handled. */
export const applyNoLandingSiteError = (
  state: Pick<ClientState, "joinSeasonPending" | "joinSeasonClosedMessage" | "joinSeasonOverlayOpen">,
  code: string,
  message: string
): boolean => {
  if (code !== "NO_LANDING_SITE") return false;
  state.joinSeasonPending = false;
  state.joinSeasonOverlayOpen = true;
  state.joinSeasonClosedMessage = message || NO_LANDING_SITE_FALLBACK;
  return true;
};

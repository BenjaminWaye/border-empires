// The honest join card (GDD §6, "Join at any time, with an honest warning"):
// a running Sector Contest states its day, the manpower a new House lands
// with, and how hard landing is now (contestDifficulty: the contest's day and
// the leader's size), and offers waiting for the next contest instead. "No landing site, no join": NO_LANDING_SITE closes joining, and
// the gateway reserves the player's place in the next contest.
import { LANDING_MANPOWER_RESERVE, landingManpowerReserve } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

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

export type ContestDifficulty = "low" | "moderate" | "high";

/**
 * Tiles the largest House holds at which a new House starts to face a real fight, and a hard one. A new House
 * lands with one town's ground, so a leader in the low hundreds is still close; past ~500 it has room and
 * manpower to take a newcomer's land. Judgment thresholds (first-15 playtest 2026-11-28: every running contest
 * said "high", even day 1).
 */
export const DIFFICULTY_MODERATE_LEADER_TILES = 150;
export const DIFFICULTY_HIGH_LEADER_TILES = 500;
/** Without a leaderboard (older gateway), the day alone: young contests are easy, old ones hard. */
const DIFFICULTY_MODERATE_DAY = 3;
const DIFFICULTY_HIGH_DAY = 8;

/** How hard landing is now: by the leader's tiles when known (an old contest is never "low"), else by the day. */
export const contestDifficulty = (day: number | undefined, leaderTiles: number | undefined): ContestDifficulty => {
  if (leaderTiles !== undefined && Number.isFinite(leaderTiles)) {
    if (leaderTiles >= DIFFICULTY_HIGH_LEADER_TILES) return "high";
    if (leaderTiles >= DIFFICULTY_MODERATE_LEADER_TILES || (day ?? 1) >= DIFFICULTY_HIGH_DAY) return "moderate";
    return "low";
  }
  if (day === undefined) return "high";
  return day >= DIFFICULTY_HIGH_DAY ? "high" : day >= DIFFICULTY_MODERATE_DAY ? "moderate" : "low";
};

/** The largest House's tiles on the leaderboard the INIT carried; undefined when it is empty. */
export const leaderTilesFrom = (leaderboard: { overall?: ReadonlyArray<{ tiles: number }>; byTiles?: ReadonlyArray<{ value: number }> } | undefined): number | undefined => {
  const tiles = [...(leaderboard?.overall ?? []).map((row) => row.tiles), ...(leaderboard?.byTiles ?? []).map((row) => row.value)].filter(Number.isFinite);
  return tiles.length > 0 ? Math.max(...tiles) : undefined;
};

const difficultyLine = (level: ContestDifficulty, leaderTiles: number | undefined): string => {
  const leader = leaderTiles === undefined ? "" : ` The largest House holds ${formatCount(leaderTiles)} tiles.`;
  if (level === "low") return `<strong>Difficulty: low.</strong> The contest is young and the Houses are still small.`;
  if (level === "moderate") return `<strong>Difficulty: moderate.</strong>${leader} Expect border fights.`;
  return `<strong>Difficulty: high.</strong>${leader} Expect to fight to hold ground.`;
};

/** The warning shown above the Land button. `leaderTiles`: the largest House's tiles, when the leaderboard is known. */
export const lateJoinWarningHtml = (facts: LateJoinFacts | undefined, singleContest: boolean, leaderTiles?: number): string => {
  const dayLine = facts ? `<p class="respawn-summary">This Sector Contest is on <strong>day ${facts.day}</strong>.</p>` : "";
  const bonusLine = facts
    ? `<p class="respawn-summary">You land with <strong>${formatCount(facts.landingManpower)} extra manpower</strong>${
        facts.catchUp > 0 ? ` (${formatCount(LANDING_MANPOWER_RESERVE)} landing reserve plus ${formatCount(facts.catchUp)} for the time you missed)` : ""
      }.</p>`
    : "";
  const level = contestDifficulty(facts?.day, leaderTiles);
  // Only a hard landing suggests waiting; a calm one has nothing to wait for.
  const waitLine = singleContest || level === "low" ? "" : " You can wait for the next Sector Contest instead.";
  return `${dayLine}${bonusLine}<p class="respawn-summary" data-contest-difficulty="${level}">${difficultyLine(level, leaderTiles)}${waitLine}</p>`;
};

/** The second button on the join card: wait for the next contest (or, on a hosted sector, simply not now). */
export const waitButtonHtml = (singleContest: boolean): string =>
  `<button id="join-season-wait" class="panel-btn" type="button">${singleContest ? "Not now" : "Wait for the next contest"}</button>`;

/** The card shown once joining is closed for lack of a landing site. */
export const joinClosedHtml = (message: string, sectorListHtml = ""): string => `
    <div class="respawn-backdrop" id="join-season-backdrop"></div>
    <div class="respawn-modal card" role="dialog" aria-modal="true" aria-labelledby="join-season-title">
      <button id="join-season-close" class="guide-close-btn" type="button" aria-label="Close">×</button>
      <div class="respawn-modal-scroll">
        <div class="respawn-kicker">Sector Contest</div>
        <h2 id="join-season-title" class="respawn-title">No landing site left</h2>
        <p class="respawn-summary">${escapeHtml(message)}</p>
        ${sectorListHtml}
      </div>
    </div>
  `;

/** INIT fields for the join card. Absent fields (older gateways) leave the card without day and bonus lines. */
export const applyInitJoinScreenFields = (
  state: Pick<ClientState, "seasonStartedAt" | "singleContest" | "joinSeasonClosedMessage" | "joinSeasonWaiting">,
  msg: Record<string, unknown>
): void => {
  // Every INIT opens the join card afresh (joinSeasonOverlayOpen), so a new contest never opens on the waiting view.
  state.joinSeasonWaiting = false;
  state.seasonStartedAt = typeof msg.seasonStartedAt === "number" && Number.isFinite(msg.seasonStartedAt) ? msg.seasonStartedAt : 0;
  state.singleContest = msg.singleContest === true;
  state.joinSeasonClosedMessage = "";
};

const NO_LANDING_SITE_FALLBACK = "There is no free landing site left on this map, so joining is closed.";

/** NO_LANDING_SITE reply to JOIN_SEASON: keep the card up, switched to the closed message. Returns true when handled. */
export const applyNoLandingSiteError = (
  state: Pick<ClientState, "joinSeasonPending" | "joinSeasonClosedMessage" | "joinSeasonOverlayOpen" | "sectorListLoadedFor">,
  code: string,
  message: string
): boolean => {
  if (code !== "NO_LANDING_SITE") return false;
  // Reload the sector list: this sector now shows as full.
  state.sectorListLoadedFor = "";
  state.joinSeasonPending = false;
  state.joinSeasonOverlayOpen = true;
  state.joinSeasonClosedMessage = message || NO_LANDING_SITE_FALLBACK;
  return true;
};

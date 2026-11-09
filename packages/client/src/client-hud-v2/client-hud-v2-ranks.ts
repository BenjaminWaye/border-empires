// Ranks for the new HUD, drawn as the race for the Duke's seat: one track per
// victory path from zero to the win line, with the top three's crests and yours
// placed by their numeric progress. Standings below keep the plain ranking.

import type { LeaderboardOverallEntry, SeasonVictoryObjectiveView, SeasonWinnerView } from "../client-types.js";
import { assignLanes, LANE_STEP_PX } from "./client-hud-v2-ranks-lanes.js";
import { seasonWinnerName, seasonWinnerPath } from "./client-hud-v2-season-winner.js";

export type RanksInput = {
  me: string;
  objectives: readonly SeasonVictoryObjectiveView[];
  /** Set once the season is crowned; the banner and winning track then say "won" instead of "holding". */
  winner?: SeasonWinnerView | undefined;
  overall: readonly LeaderboardOverallEntry[];
  selfOverall: LeaderboardOverallEntry | undefined;
  nameOf: (playerId: string) => string;
  colorOf: (playerId: string) => string | undefined;
};

export const STANDINGS_CAP = 10;

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Leader's share of the way to the win line; 1 once they meet it. */
export const leaderShare = (o: SeasonVictoryObjectiveView): number | undefined =>
  o.conditionMet ? 1 : typeof o.progress === "number" ? clamp01(o.progress) : undefined;

/** Your own share; the leader's value when you lead the path. */
export const selfShare = (o: SeasonVictoryObjectiveView, me: string): number | undefined => {
  if (o.leaderPlayerId === me) return leaderShare(o);
  return typeof o.selfProgress === "number" ? nonLeaderShare(o, o.selfProgress) : undefined;
};

/** A non-leader's track position from their raw progress (the viewer's selfProgress or a contender's). */
export const nonLeaderShare = (o: SeasonVictoryObjectiveView, progress: number): number | undefined => {
  // Economic Hegemony's non-leader value is income as a share of the leader's (season-victory-self-progress.ts),
  // not distance to the win line like the leader's. Scale it onto the leader's position so the top earner is
  // never drawn behind anyone.
  if (o.id === "ECONOMIC_HEGEMONY") {
    const lead = leaderShare(o);
    return lead === undefined ? undefined : clamp01(progress * lead);
  }
  return clamp01(progress);
};

export const formatHold = (seconds: number | undefined): string => {
  if (seconds === undefined) return "";
  const totalMinutes = Math.ceil(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h${m > 0 && h < 10 ? ` ${m}m` : ""}` : `${Math.max(1, m)}m`;
};

/** The path you're closest on (ignoring ones you can't be placed on). */
export const closestPath = (objectives: readonly SeasonVictoryObjectiveView[], me: string): SeasonVictoryObjectiveView | undefined =>
  [...objectives]
    .filter((o) => selfShare(o, me) !== undefined)
    .sort((a, b) => (selfShare(b, me) ?? 0) - (selfShare(a, me) ?? 0))[0];

const crest = (name: string, color: string | undefined, extra: string): string =>
  `<span class="v2r-crest ${extra}" style="background:${esc(color ?? "#5a4828")}">${esc((name.trim()[0] ?? "?").toUpperCase())}</span>`;

type TrackPin = { playerId: string; share: number; priority: number; title: string; color: string | undefined; classes: string; crest: string };

const pinsHtml = (pins: readonly TrackPin[]): { html: string; lanes: number } => {
  const lanes = assignLanes(pins);
  const deepest = Math.max(0, ...lanes.map(Math.abs));
  const html = pins.map((pin, i) => {
    const lane = lanes[i] ?? 0;
    const left = `left:${(pin.share * 100).toFixed(1)}%`;
    // The crest on the rail (the frontmost of a cluster) draws over laned ones.
    const z = `z-index:${10 - Math.abs(lane)}`;
    const shift = lane === 0 ? "" : `;--v2r-lane:${lane * LANE_STEP_PX}px`;
    const tick = lane === 0 ? "" : `<span class="v2r-tick" style="${left};background:${esc(pin.color ?? "#5a4828")}" aria-hidden="true"></span>`;
    // Each crest opens that player's profile, like the Standings rows.
    return `${tick}<button type="button" class="${pin.classes}" style="${left};${z}${shift}" title="${pin.title}" data-hud-v2-profile="${esc(pin.playerId)}">${pin.crest}</button>`;
  }).join("");
  return { html, lanes: deepest };
};

const trackHtml = (o: SeasonVictoryObjectiveView, input: RanksInput): string => {
  const lead = leaderShare(o);
  const mine = selfShare(o, input.me);
  const iLead = o.leaderPlayerId === input.me;
  const leaderName = o.leaderPlayerId ? input.nameOf(o.leaderPlayerId) || o.leaderName : o.leaderName;
  const holding = o.conditionMet && o.leaderName;
  const pins: TrackPin[] = [];
  if (lead !== undefined && o.leaderPlayerId && !iLead) {
    const color = input.colorOf(o.leaderPlayerId);
    pins.push({ playerId: o.leaderPlayerId, share: lead, priority: 3, color, classes: "v2r-pin", title: `${esc(leaderName)} · ${esc(o.progressLabel)}`, crest: crest(leaderName, color, holding ? "v2r-holding" : "") });
  }
  // Runners-up (2nd and 3rd); the viewer is drawn by their own pin instead.
  for (const c of (o.contenders ?? []).filter((entry) => entry.playerId !== input.me)) {
    const share = nonLeaderShare(o, c.progress);
    if (share === undefined) continue;
    const name = input.nameOf(c.playerId) || c.name;
    const color = input.colorOf(c.playerId);
    pins.push({ playerId: c.playerId, share, priority: 1, color, classes: "v2r-pin v2r-pin-rival", title: esc(name), crest: crest(name, color, "v2r-rival") });
  }
  if (mine !== undefined) {
    const color = input.colorOf(input.me);
    pins.push({ playerId: input.me, share: mine, priority: 2, color, classes: "v2r-pin v2r-pin-you", title: `You · ${esc(iLead ? o.progressLabel : o.selfProgressLabel ?? "")}`, crest: crest(input.nameOf(input.me) || "You", color, `v2r-you${iLead && holding ? " v2r-holding" : ""}`) });
  }
  const laid = pinsHtml(pins);
  const leaderLink = o.leaderPlayerId
    ? `<button type="button" class="v2r-name-link" data-hud-v2-profile="${esc(o.leaderPlayerId)}">${esc(leaderName)}</button>`
    : esc(leaderName);
  const won = input.winner?.objectiveId === o.id ? input.winner : undefined;
  const status = won
    ? `<span class="v2r-status v2r-status-won">♛ ${esc(seasonWinnerName(won, input.me, input.nameOf))} won</span>`
    : holding
    ? `<span class="v2r-status v2r-status-hold">⧗ ${iLead ? "You" : leaderLink} holding${o.holdRemainingSeconds === undefined ? "" : ` · ${formatHold(o.holdRemainingSeconds)} left`}</span>`
    : iLead
      ? `<span class="v2r-status v2r-status-you">★ You lead</span>`
      : o.leaderName
        ? `<span class="v2r-status">${leaderLink} leads</span>`
        : `<span class="v2r-status">No contender</span>`;
  // The leader's figure sits under their name; yours gets its own line when you trail.
  const leaderLine = o.leaderName ? `<span class="v2r-path-line">${esc(o.progressLabel)}</span>` : "";
  const youLine = !iLead && o.selfProgressLabel ? `<span class="v2r-path-line v2r-side-you">You · ${esc(o.selfProgressLabel)}</span>` : "";
  const trackStyle = laid.lanes > 0 ? ` style="height:${44 + laid.lanes * 2 * LANE_STEP_PX}px"` : "";
  return `<div class="v2r-row">
    <div class="v2r-path"><span class="v2r-path-name">${esc(o.name)}</span><span class="v2r-path-line">${esc(o.thresholdLabel)}</span></div>
    <div class="v2r-track"${trackStyle} role="group" aria-label="${esc(o.name)}: ${esc(o.progressLabel)}"><span class="v2r-rail"></span><span class="v2r-line" aria-hidden="true"></span>${laid.html}</div>
    <div class="v2r-side">${status}${leaderLine}${youLine}</div>
  </div>`;
};

export const ranksBannerHtml = (input: RanksInput): string => {
  if (input.winner) return `<span class="v2r-banner v2r-banner-won">♛ ${esc(seasonWinnerName(input.winner, input.me, input.nameOf))} won ${esc(seasonWinnerPath(input.winner))}</span>`;
  const holding = input.objectives.filter((o) => o.conditionMet && o.leaderName).sort((a, b) => (a.holdRemainingSeconds ?? Infinity) - (b.holdRemainingSeconds ?? Infinity))[0];
  if (!holding) return `<span class="v2r-banner">Hold any path past the line for 24h</span>`;
  const who = holding.leaderPlayerId === input.me ? "You are" : `${esc(holding.leaderPlayerId ? input.nameOf(holding.leaderPlayerId) || holding.leaderName : holding.leaderName)} is`;
  return `<span class="v2r-banner v2r-banner-hold">⧗ ${who} holding ${esc(holding.name)}${holding.holdRemainingSeconds === undefined ? "" : ` · ${formatHold(holding.holdRemainingSeconds)} to win`}</span>`;
};

const standingsHtml = (input: RanksInput): string => {
  const top = input.overall.slice(0, STANDINGS_CAP);
  const rows = [...top];
  if (input.selfOverall && !top.some((e) => e.id === input.me)) rows.push(input.selfOverall);
  const best = Math.max(1, ...rows.map((e) => e.score));
  return rows.map((e) => `<button type="button" class="v2r-stand${e.id === input.me ? " v2r-stand-you" : ""}" data-hud-v2-profile="${esc(e.id)}">
      <span class="v2r-rank">${e.rank}</span>${crest(e.name, input.colorOf(e.id), "")}<span class="v2r-stand-name">${e.id === input.me ? "You" : esc(e.name)}</span>
      <span class="v2r-stand-bar"><span style="width:${((e.score / best) * 100).toFixed(1)}%"></span></span><span class="v2r-stand-val">${e.score.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
    </button>`).join("");
};

export const ranksBodyHtml = (input: RanksInput): string => {
  const tracks = input.objectives.length > 0
    ? input.objectives.map((o) => trackHtml(o, input)).join("")
    : `<div class="v2s-empty">No season running</div>`;
  const best = closestPath(input.objectives, input.me);
  const closest = best
    ? `<section class="v2r-card"><h2 class="v2s-h2">Your closest path</h2><span class="v2r-closest-name">${esc(best.name)}</span><span class="v2r-closest-pct">${Math.round((selfShare(best, input.me) ?? 0) * 100)}%</span><span class="v2r-path-line">${esc(best.leaderPlayerId === input.me ? best.progressLabel : best.selfProgressLabel ?? "")}</span></section>`
    : "";
  return `<div class="v2r-layout">
    <section class="v2r-race"><div class="v2r-axis"><span>Start</span><span>Win line</span></div>${tracks}</section>
    <aside class="v2r-aside">${closest}<section class="v2r-card"><h2 class="v2s-h2">Standings <span class="v2s-meta">power score</span></h2>${standingsHtml(input)}</section></aside>
  </div>`;
};

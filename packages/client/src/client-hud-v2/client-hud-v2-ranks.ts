// Ranks for the new HUD, drawn as the race for the Duke's seat: one track per
// victory path from zero to the win line, with the leader's crest and yours
// placed by their numeric progress. Standings below keep the plain ranking.

import type { LeaderboardOverallEntry, SeasonVictoryObjectiveView } from "../client-types.js";

export type RanksInput = {
  me: string;
  objectives: readonly SeasonVictoryObjectiveView[];
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
export const selfShare = (o: SeasonVictoryObjectiveView, me: string): number | undefined =>
  o.leaderPlayerId === me ? leaderShare(o) : typeof o.selfProgress === "number" ? clamp01(o.selfProgress) : undefined;

export const formatHold = (seconds: number | undefined): string => {
  if (seconds === undefined) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return h > 0 ? `${h}h${m > 0 && h < 10 ? ` ${m}m` : ""}` : `${Math.max(1, m)}m`;
};

/** The path you're closest on (ignoring ones you can't be placed on). */
export const closestPath = (objectives: readonly SeasonVictoryObjectiveView[], me: string): SeasonVictoryObjectiveView | undefined =>
  [...objectives]
    .filter((o) => selfShare(o, me) !== undefined)
    .sort((a, b) => (selfShare(b, me) ?? 0) - (selfShare(a, me) ?? 0))[0];

const crest = (name: string, color: string | undefined, extra: string): string =>
  `<span class="v2r-crest ${extra}" style="background:${esc(color ?? "#5a4828")}">${esc((name.trim()[0] ?? "?").toUpperCase())}</span>`;

const trackHtml = (o: SeasonVictoryObjectiveView, input: RanksInput): string => {
  const lead = leaderShare(o);
  const mine = selfShare(o, input.me);
  const iLead = o.leaderPlayerId === input.me;
  const leaderName = o.leaderPlayerId ? input.nameOf(o.leaderPlayerId) || o.leaderName : o.leaderName;
  const holding = o.conditionMet && o.leaderName;
  const leaderPin = lead !== undefined && o.leaderPlayerId && !iLead
    ? `<span class="v2r-pin" style="left:${(lead * 100).toFixed(1)}%" title="${esc(leaderName)} · ${esc(o.progressLabel)}">${crest(leaderName, input.colorOf(o.leaderPlayerId), holding ? "v2r-holding" : "")}</span>`
    : "";
  const youPin = mine !== undefined
    ? `<span class="v2r-pin v2r-pin-you" style="left:${(mine * 100).toFixed(1)}%" title="You · ${esc(iLead ? o.progressLabel : o.selfProgressLabel ?? "")}">${crest(input.nameOf(input.me) || "You", input.colorOf(input.me), `v2r-you${iLead && holding ? " v2r-holding" : ""}`)}</span>`
    : "";
  const status = holding
    ? `<span class="v2r-status v2r-status-hold">⌛ ${esc(iLead ? "You" : leaderName)} holding · ${formatHold(o.holdRemainingSeconds)} left</span>`
    : iLead
      ? `<span class="v2r-status v2r-status-you">★ You lead</span>`
      : o.leaderName
        ? `<span class="v2r-status">${esc(leaderName)} leads</span>`
        : `<span class="v2r-status">No contender</span>`;
  return `<div class="v2r-row">
    <div class="v2r-path"><span class="v2r-path-name">${esc(o.name)}</span><span class="v2r-path-line">${esc(o.thresholdLabel)}</span></div>
    <div class="v2r-track" role="img" aria-label="${esc(o.name)}: ${esc(o.progressLabel)}"><span class="v2r-rail"></span><span class="v2r-line" aria-hidden="true"></span>${leaderPin}${youPin}</div>
    <div class="v2r-side">${status}<span class="v2r-path-line">${esc(iLead ? o.progressLabel : o.selfProgressLabel ?? o.progressLabel)}</span></div>
  </div>`;
};

export const ranksBannerHtml = (input: RanksInput): string => {
  const holding = input.objectives.filter((o) => o.conditionMet && o.leaderName).sort((a, b) => (a.holdRemainingSeconds ?? Infinity) - (b.holdRemainingSeconds ?? Infinity))[0];
  if (!holding) return `<span class="v2r-banner">Hold any path past the line for 24h</span>`;
  const who = holding.leaderPlayerId === input.me ? "You are" : `${esc(holding.leaderPlayerId ? input.nameOf(holding.leaderPlayerId) || holding.leaderName : holding.leaderName)} is`;
  return `<span class="v2r-banner v2r-banner-hold">⌛ ${who} holding ${esc(holding.name)} · ${formatHold(holding.holdRemainingSeconds)} to win</span>`;
};

const standingsHtml = (input: RanksInput): string => {
  const top = input.overall.slice(0, STANDINGS_CAP);
  const rows = [...top];
  if (input.selfOverall && !top.some((e) => e.id === input.me)) rows.push(input.selfOverall);
  const best = Math.max(1, ...rows.map((e) => e.tiles));
  return rows.map((e) => `<button type="button" class="v2r-stand${e.id === input.me ? " v2r-stand-you" : ""}" data-hud-v2-profile="${esc(e.id)}">
      <span class="v2r-rank">${e.rank}</span>${crest(e.name, input.colorOf(e.id), "")}<span class="v2r-stand-name">${e.id === input.me ? "You" : esc(e.name)}</span>
      <span class="v2r-stand-bar"><span style="width:${((e.tiles / best) * 100).toFixed(1)}%"></span></span><span class="v2r-stand-val">${e.tiles.toLocaleString("en-US")}</span>
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
    <aside class="v2r-aside">${closest}<section class="v2r-card"><h2 class="v2s-h2">Standings <span class="v2s-meta">tiles</span></h2>${standingsHtml(input)}</section></aside>
  </div>`;
};

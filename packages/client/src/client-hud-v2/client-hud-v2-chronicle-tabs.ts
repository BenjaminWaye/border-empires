// Chronicle tabs for the new HUD. Chronicle replaces the legacy activity
// dashboard: Yours (the personal timeline, with Show buttons),
// Ahead (the forecast of what is still to come, client-hud-v2-chronicle-ahead.ts),
// World (the daily world pulse) and Updates (release notes, in
// client-hud-v2-chronicle-updates.ts). The dashboard's
// own auto-open is routed here with the tab it would have shown.

import type { WorldPulse } from "@border-empires/game-domain";
import type { ClientState } from "../client-state/client-state.js";
import type { HudV2ScreenState } from "./client-hud-v2-context.js";

export type ChronicleTab = HudV2ScreenState["chronicleTab"];

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The legacy dashboard's view, as the Chronicle tab that shows it. */
export const chronicleTabForDashboardView = (view: ClientState["activityDashboard"]["activeView"]): ChronicleTab =>
  view === "WORLD_PULSE" ? "world" : view === "UPDATES" ? "updates" : "yours";

export type ChronicleTabsInput = { tab: ChronicleTab; unreadActivity: number; unseenUpdates: number };

export const chronicleTabsHtml = (input: ChronicleTabsInput): string => {
  const tab = (id: ChronicleTab, label: string, badge: number): string =>
    `<button type="button" role="tab" class="v2c-tab${input.tab === id ? " v2c-tab-on" : ""}" aria-selected="${input.tab === id}" data-v2-chronicle-tab="${id}">${label}${badge > 0 ? `<span class="v2c-tab-badge">${Math.min(99, badge)}</span>` : ""}</button>`;
  return `<div class="v2c-tabs" role="tablist" aria-label="Chronicle">${tab("yours", "Yours", input.unreadActivity)}${tab("ahead", "Ahead", 0)}${tab("world", "World", 0)}${tab("updates", "Updates", input.unseenUpdates)}</div>`;
};

/** The live Ranks leaderboard (GLOBAL_STATUS_UPDATE), the same list the profile reads its rank from. */
export type WorldTabStandings = { overall: ReadonlyArray<{ id: string; name: string; score: number; rank: number }>; me: string };

export type WorldTabInput = { pulse: WorldPulse | undefined; loading: boolean; error: string | undefined; standings?: WorldTabStandings };

/**
 * Your rank and the leading powers, from the live leaderboard when there is one. The pulse is fetched
 * once and cached by the gateway, so its rank lagged the profile's (#24 against #23, playtest 2026-11-26).
 */
const liveStanding = (pulse: WorldPulse, standings: WorldTabStandings | undefined): { rank: number | undefined; leadingPowers: WorldPulse["leadingPowers"] } => {
  if (!standings || standings.overall.length === 0) return { rank: pulse.rank, leadingPowers: pulse.leadingPowers };
  return {
    rank: standings.overall.find((e) => e.id === standings.me)?.rank,
    leadingPowers: standings.overall.slice(0, WORLD_LEADING_POWERS).map((e) => ({ playerId: e.id, name: e.name, score: e.score, rank: e.rank }))
  };
};

/** As many leading powers as the pulse lists (world-pulse.ts WORLD_PULSE_LEADING_POWER_CAP). */
const WORLD_LEADING_POWERS = 5;

export const worldTabHtml = (input: WorldTabInput): string => {
  const fetched = input.pulse;
  if (!fetched) return `<div class="v2s-empty">${esc(input.error ?? (input.loading ? "Loading…" : "No world news yet"))}</div>`;
  const pulse = fetched;
  const { rank: myRank, leadingPowers } = liveStanding(fetched, input.standings);
  const change = typeof pulse.rankChange === "number" && pulse.rankChange !== 0
    ? `<span class="v2c-rank-change ${pulse.rankChange > 0 ? "v2c-up" : "v2c-down"}">${pulse.rankChange > 0 ? "▲" : "▼"}${Math.abs(pulse.rankChange)}</span>`
    : "";
  const rank = `<div class="v2c-world-rank"><span class="v2c-world-label">${esc(pulse.seasonLabel ?? "This Sector Contest")}</span><span class="v2c-world-you">${typeof myRank === "number" ? `You #${myRank}` : "Unranked"}${change}</span></div>`;
  const powers = leadingPowers.length > 0
    ? `<div class="v2c-powers">${leadingPowers.map((p) => `<span class="v2c-power"><b>#${p.rank}</b> ${esc(p.name)} <span class="v2c-power-score">${Math.round(p.score)}</span></span>`).join("")}</div>`
    : "";
  const stories = pulse.stories.length > 0
    ? pulse.stories.map((s) => `<article class="v2c-story"><h3>${esc(s.headline)}</h3><p>${esc(s.text)}</p></article>`).join("")
    : `<div class="v2s-empty">The realm is quiet in the last day</div>`;
  return `${rank}${powers}<div class="v2c-list" data-v2-scroll="chronicle-world">${stories}</div>`;
};

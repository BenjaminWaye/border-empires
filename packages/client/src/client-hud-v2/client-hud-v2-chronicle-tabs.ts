// Chronicle tabs for the new HUD. Chronicle replaces the legacy activity
// dashboard under ?hud=v2: Yours (the personal timeline, with Show buttons),
// World (the daily world pulse) and Updates (release notes). The dashboard's
// own auto-open is routed here with the tab it would have shown.

import type { WorldPulse } from "@border-empires/game-domain";
import { changelogBodyHtml, sortedClientChangelogEntries, unseenClientChangelogEntries } from "../client-changelog/client-changelog.js";
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
  return `<div class="v2c-tabs" role="tablist" aria-label="Chronicle">${tab("yours", "Yours", input.unreadActivity)}${tab("world", "World", 0)}${tab("updates", "Updates", input.unseenUpdates)}</div>`;
};

export type WorldTabInput = { pulse: WorldPulse | undefined; loading: boolean; error: string | undefined };

export const worldTabHtml = (input: WorldTabInput): string => {
  const pulse = input.pulse;
  if (!pulse) return `<div class="v2s-empty">${esc(input.error ?? (input.loading ? "Loading…" : "No world news yet"))}</div>`;
  const change = typeof pulse.rankChange === "number" && pulse.rankChange !== 0
    ? `<span class="v2c-rank-change ${pulse.rankChange > 0 ? "v2c-up" : "v2c-down"}">${pulse.rankChange > 0 ? "▲" : "▼"}${Math.abs(pulse.rankChange)}</span>`
    : "";
  const rank = `<div class="v2c-world-rank"><span class="v2c-world-label">${esc(pulse.seasonLabel ?? "This season")}</span><span class="v2c-world-you">${typeof pulse.rank === "number" ? `You #${pulse.rank}` : "Unranked"}${change}</span></div>`;
  const powers = pulse.leadingPowers.length > 0
    ? `<div class="v2c-powers">${pulse.leadingPowers.map((p) => `<span class="v2c-power"><b>#${p.rank}</b> ${esc(p.name)} <span class="v2c-power-score">${Math.round(p.score)}</span></span>`).join("")}</div>`
    : "";
  const stories = pulse.stories.length > 0
    ? pulse.stories.map((s) => `<article class="v2c-story"><h3>${esc(s.headline)}</h3><p>${esc(s.text)}</p></article>`).join("")
    : `<div class="v2s-empty">The realm is quiet in the last day</div>`;
  return `${rank}${powers}<div class="v2c-list" data-v2-scroll="chronicle-world">${stories}</div>`;
};

/** Unseen release notes, or the recent ten when everything has been read. `baselineSeenAt` pins the list while the tab is open. */
export const updatesTabHtml = (baselineSeenAt: number): string => {
  const unseen = unseenClientChangelogEntries(baselineSeenAt);
  const entries = unseen.length > 0 ? unseen : sortedClientChangelogEntries().slice(0, 10);
  if (entries.length === 0) return `<div class="v2s-empty">No release notes yet</div>`;
  const label = unseen.length > 0 ? `${unseen.length} new` : "Recent";
  return `<div class="v2c-day">${label}</div><div class="v2c-list v2c-updates changelog-entry-list" data-v2-scroll="chronicle-updates">${changelogBodyHtml(entries)}</div>`;
};

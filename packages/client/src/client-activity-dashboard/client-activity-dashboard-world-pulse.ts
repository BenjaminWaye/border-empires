import type { WorldPulse } from "@border-empires/game-domain";

import { escapeActivityDashboardHtml } from "./client-activity-dashboard-escape.js";

export const worldPulseAtGlanceHtml = (pulse: WorldPulse | undefined): string => {
  if (!pulse) return '<div class="activity-dashboard-glance">Current season</div>';
  const rank = typeof pulse.rank === "number" ? `Your rank #${pulse.rank}` : "Unranked";
  const movement = typeof pulse.rankChange === "number" ? ` <span class="activity-dashboard-rank-change ${pulse.rankChange > 0 ? "is-up" : "is-down"}">${pulse.rankChange > 0 ? "↑" : "↓"}${Math.abs(pulse.rankChange)}</span>` : "";
  const powers = pulse.leadingPowers.map((power) => `${escapeActivityDashboardHtml(power.name)} ${Math.round(power.score)}`).join(", ");
  const headline = `${escapeActivityDashboardHtml(pulse.seasonLabel ?? "Current season")} · ${rank}${movement}`;
  const details = powers ? `<span class="activity-dashboard-glance-detail">Leading powers: ${powers}</span>` : "";
  return `<div class="activity-dashboard-glance activity-dashboard-glance-desktop">${headline}${details}</div><details class="activity-dashboard-glance activity-dashboard-glance-mobile"><summary>${headline} · Show leading powers</summary>${details}</details>`;
};

export const worldPulseBodyHtml = (input: { pulse?: WorldPulse; loading: boolean; error?: string }): string => {
  if (input.loading && !input.pulse) return '<div class="activity-dashboard-empty-state">Loading the world pulse…</div>';
  if (input.error && !input.pulse) return `<div class="activity-dashboard-empty-state">${escapeActivityDashboardHtml(input.error)}</div>`;
  if (!input.pulse || input.pulse.stories.length === 0) return '<div class="activity-dashboard-empty-state">The realm is quiet in the last day.</div>';
  return `<div class="activity-dashboard-world-list">${input.pulse.stories.map((story) => `<article class="activity-dashboard-world-story"><h3>${escapeActivityDashboardHtml(story.headline)}</h3><p>${escapeActivityDashboardHtml(story.text)}</p></article>`).join("")}</div>`;
};

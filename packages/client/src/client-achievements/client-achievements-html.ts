// Achievement badges on your own profile, and the Longest Road card on Ranks.
import { ACHIEVEMENTS, type AchievementsView, type LiveLongestRoad } from "@border-empires/shared";

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const int = (value: number): string => Math.round(value).toLocaleString("en-US");

/** Your own profile only: one badge per achievement, lit once earned, with progress until then. */
export const achievementsProfileSectionHtml = (view: AchievementsView | undefined): string => {
  if (!view) return "";
  const earnedCount = ACHIEVEMENTS.filter((a) => view.earned[a.id] !== undefined).length;
  const badges = ACHIEVEMENTS.map((a) => {
    const earned = view.earned[a.id] !== undefined;
    const value = view.progress[a.id] ?? 0;
    const pct = Math.max(0, Math.min(100, (value / a.target) * 100));
    const state = earned ? "Earned" : `${int(value)} / ${int(a.target)}`;
    return `<li class="ach-badge${earned ? " is-earned" : ""}" title="${esc(a.goal)}">
      <span class="ach-seal" aria-hidden="true">${earned ? "★" : "☆"}</span>
      <span class="ach-name">${esc(a.name)}</span>
      <span class="ach-goal">${esc(a.goal)}</span>
      ${earned ? "" : `<span class="ach-bar" aria-hidden="true"><span style="width:${pct.toFixed(1)}%"></span></span>`}
      <span class="ach-state">${state}</span>
    </li>`;
  }).join("");
  return `<section class="v2p-panel ach-panel"><h3>Achievements <span class="v2s-meta">${earnedCount} / ${ACHIEVEMENTS.length}</span></h3><ul class="ach-grid">${badges}</ul></section>`;
};

/** Ranks aside card: who holds Longest Road right now. Hidden until the first push. */
export const longestRoadCardHtml = (road: LiveLongestRoad | null | undefined, me: string, nameOf: (id: string) => string): string => {
  if (road === undefined) return "";
  if (road === null) return `<section class="v2r-card"><h2 class="v2s-h2">Longest Road</h2><span class="v2r-path-line">No road yet: join two Towns with garrisoned land</span></section>`;
  const holder = road.playerId === me
    ? `<span class="v2r-closest-name">You</span>`
    : `<button type="button" class="v2r-name-link v2r-closest-name" data-hud-v2-profile="${esc(road.playerId)}">${esc(nameOf(road.playerId) || road.playerName)}</button>`;
  return `<section class="v2r-card"><h2 class="v2s-h2">Longest Road</h2>${holder}<span class="v2r-closest-pct">${int(road.tileCount)} tiles</span><span class="v2r-path-line">${esc(road.fromTown)} to ${esc(road.toTown)}</span></section>`;
};

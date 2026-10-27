// Player profile as a frame screen, like the Manifest or Ranks: a hero column
// (crest, name, standing with you, rank) beside this season's numbers and the
// career panels. It draws from the same cached data the legacy profile fetches
// (career stats, galactic holdings, public pacts), which keeps fetching while
// its own overlay stays hidden under the new HUD.

import type { LeaderboardOverallEntry } from "@border-empires/game-domain";
import type { CareerStatsView, GalaxyHoldingsView, SocialPublicView, TruceBreakView } from "../client-player-profile/client-player-profile-types.js";
import { sectorOrSeasonLabel, specializationLabel, TROPHY_ICON_BY_OBJECTIVE_ID } from "../client-player-profile/client-player-profile-galaxy.js";
import { socialRemainingLabel } from "../client-panel-html/client-panel-html.js";

type Loadable<T> = T | "loading" | undefined;

export type ProfileRelation = { kind: "self" } | { kind: "ally" } | { kind: "truce"; endsAt: number } | { kind: "none" };

export type ProfileInput = {
  id: string;
  name: string;
  color: string;
  relation: ProfileRelation;
  entry: LeaderboardOverallEntry | undefined;
  career: Loadable<CareerStatsView>;
  holdings: Loadable<GalaxyHoldingsView>;
  /** Your own pacts come from live state; anyone else's from their fetched public view. */
  pacts: Loadable<Pick<SocialPublicView, "allies" | "activeTruces">>;
  truceBreaks: Loadable<TruceBreakView[]>;
  nameOf: (id: string) => string | undefined;
  nowMs: number;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const int = (value: number): string => Math.round(value).toLocaleString("en-US");

const relationHtml = (relation: ProfileRelation, nowMs: number): string => {
  switch (relation.kind) {
    case "self": return `<span class="v2p-rel v2p-rel-self">Your empire</span>`;
    case "ally": return `<span class="v2p-rel v2p-rel-ally">Ally</span>`;
    case "truce": return `<span class="v2p-rel v2p-rel-truce">Truce · ${socialRemainingLabel(relation.endsAt, nowMs)} left</span>`;
    default: return `<span class="v2p-rel">No pact</span>`;
  }
};

const heroHtml = (input: ProfileInput): string => {
  const holdings = input.holdings !== "loading" ? input.holdings : undefined;
  const breaks = Array.isArray(input.truceBreaks) ? input.truceBreaks : [];
  const badges = [
    holdings && holdings.planets.length > 0 ? `<span class="v2p-badge v2p-badge-duke">Duke · holds a planet</span>` : "",
    breaks.length > 0 ? `<span class="v2p-badge v2p-badge-oath">Oathbreaker ×${breaks.length}</span>` : ""
  ].join("");
  const rank = input.entry
    ? `<div class="v2p-rank"><b>#${input.entry.rank}</b><span>Rank</span></div>`
    : `<div class="v2p-rank"><b>—</b><span>Unranked</span></div>`;
  // Barbarians take no deals.
  const diplomacy = input.relation.kind === "self" || input.id.startsWith("barbarian")
    ? ""
    : `<button type="button" class="v2p-action" data-v2-profile-diplomacy="${esc(input.id)}">Diplomacy ▸</button>`;
  return `<aside class="v2p-hero">
    <span class="v2p-crest" style="background:${esc(input.color)}" aria-hidden="true">${esc((input.name.trim()[0] ?? "?").toUpperCase())}</span>
    <h2 class="v2p-name">${esc(input.name)}</h2>
    ${relationHtml(input.relation, input.nowMs)}
    ${rank}
    ${badges ? `<div class="v2p-badges">${badges}</div>` : ""}
    ${diplomacy}
  </aside>`;
};

const statsHtml = (entry: LeaderboardOverallEntry | undefined): string => {
  const card = (label: string, value: string): string => `<div class="v2p-stat"><span>${label}</span><b>${value}</b></div>`;
  const v = (fn: (e: LeaderboardOverallEntry) => string): string => (entry ? fn(entry) : "—");
  return `<div class="v2p-stats">
    ${card("Score", v((e) => int(e.score)))}
    ${card("Garrisoned tiles", v((e) => int(e.tiles)))}
    ${card("Coin / day", v((e) => (e.incomePerMinute * 1440).toFixed(1)))}
    ${card("Techs", v((e) => int(e.techs)))}
    ${card("Manpower cap", v((e) => int(e.manpowerCap)))}
  </div>`;
};

const panel = (title: string, body: string): string =>
  `<section class="v2p-panel"><h3>${title}</h3>${body}</section>`;

const rows = (items: ReadonlyArray<[string, string]>): string =>
  `<dl class="v2p-rows">${items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;

const pending = (value: Loadable<unknown>): string | undefined =>
  value === "loading" ? `<p class="v2p-none">Loading…</p>` : value === undefined ? `<p class="v2p-none">—</p>` : undefined;

const careerHtml = (career: Loadable<CareerStatsView>): string =>
  panel("Career", pending(career) ?? (typeof career === "object" ? rows([
    ["Seasons", int(career.seasonsPlayed)],
    ["Best finish", career.bestRank !== null ? `#${career.bestRank}` : "—"],
    ["Peak score", career.peakScore !== null ? int(career.peakScore) : "—"],
    ["Peak tiles", career.peakTiles !== null ? int(career.peakTiles) : "—"]
  ]) : ""));

const trophiesHtml = (holdings: Loadable<GalaxyHoldingsView>): string => {
  const wait = pending(holdings);
  if (wait || typeof holdings !== "object") return panel("Trophies", wait ?? "");
  const trophies = holdings.trophyCase ?? [];
  return panel("Trophies", trophies.length === 0
    ? `<p class="v2p-none">No season wins yet</p>`
    : `<ul class="v2p-list">${trophies.map((t) => `<li><span class="v2p-icon" aria-hidden="true">${TROPHY_ICON_BY_OBJECTIVE_ID[t.objectiveId] ?? "🏆"}</span>${esc(t.objectiveName)}<b>×${t.count}</b></li>`).join("")}</ul>`);
};

const holdingsHtml = (holdings: Loadable<GalaxyHoldingsView>): string => {
  const wait = pending(holdings);
  if (wait || typeof holdings !== "object") return panel("Galactic holdings", wait ?? "");
  const items = [
    ...holdings.planets.map((p) => `<li>${p.planetName ? esc(p.planetName) : "Unnamed planet"}<span>${esc(p.objectiveName)} · ${esc(sectorOrSeasonLabel(p))}</span></li>`),
    ...holdings.outposts.map((o) => `<li>Outpost<span>${esc(specializationLabel(o.specialization))} · ${esc(sectorOrSeasonLabel(o))}</span></li>`)
  ];
  return panel("Galactic holdings", items.length === 0 ? `<p class="v2p-none">None</p>` : `<ul class="v2p-list">${items.join("")}</ul>`);
};

const pactsHtml = (input: ProfileInput): string => {
  const pacts = input.pacts;
  const wait = pending(pacts);
  if (wait || typeof pacts !== "object") return panel("Pacts", wait ?? "");
  const allies = pacts.allies.map((id) => `<li><span class="v2p-tag v2p-tag-ally">Ally</span>${esc(input.nameOf(id) ?? "Empire")}</li>`);
  const truces = pacts.activeTruces.map((t) => `<li><span class="v2p-tag v2p-tag-truce">Truce</span>${esc(t.otherPlayerName)}<span>${socialRemainingLabel(t.endsAt, input.nowMs)} left</span></li>`);
  const items = [...allies, ...truces];
  return panel("Pacts", items.length === 0 ? `<p class="v2p-none">None</p>` : `<ul class="v2p-list">${items.join("")}</ul>`);
};

const breaksHtml = (breaks: Loadable<TruceBreakView[]>): string => {
  if (!Array.isArray(breaks) || breaks.length === 0) return "";
  return panel("Broken truces", `<ul class="v2p-list">${breaks.map((b) => `<li class="v2p-warn">${esc(b.targetPlayerName)}</li>`).join("")}</ul>`);
};

export const profileHtml = (input: ProfileInput): string =>
  `<div class="v2p">${heroHtml(input)}<div class="v2p-main" data-v2-scroll="profile">
    <h3 class="v2p-h">This season</h3>
    ${statsHtml(input.entry)}
    <div class="v2p-grid">${careerHtml(input.career)}${trophiesHtml(input.holdings)}${holdingsHtml(input.holdings)}${pactsHtml(input)}${breaksHtml(input.truceBreaks)}</div>
  </div></div>`;

/** Which way the profile screen should move this frame: open for a newly picked player, close once it was dismissed. */
export const profileScreenStep = (activeProfileId: string | undefined, screenId: string | null): "open" | "close" | "stay" => {
  if (activeProfileId && screenId !== "profile") return "open";
  if (!activeProfileId && screenId === "profile") return "close";
  return "stay";
};

// Chronicle for the new HUD: a drawer over the live map built from the 24h
// personal activity timeline. Every event that happened somewhere has a Show
// button that flies the camera there; rivals filter one timeline.

import type { PersonalActivityCard, PersonalActivityTimeline } from "@border-empires/game-domain";
import { activityCardCoordinatesLabel, activityCardText, activityCardTimeLabel } from "../client-activity-dashboard/client-activity-dashboard-format.js";
import { activityCardTone, ACTIVITY_TONE_GLYPH } from "../client-activity-dashboard/client-activity-dashboard-tone.js";

export type ChronicleInput = {
  me: string;
  timeline: PersonalActivityTimeline | undefined;
  loading: boolean;
  error: string | undefined;
  rivalFilter: string;
  selectedId: string | undefined;
  nameOf: (playerId: string) => string | undefined;
  colorOf: (playerId: string) => string | undefined;
  techName: (techId: string) => string | undefined;
  nowMs: number;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Other empires a card involves, for the rival filter. */
export const cardCounterparties = (card: PersonalActivityCard, me: string): string[] => {
  switch (card.kind) {
    case "TERRITORY_FLIP_GROUP":
    case "COMBAT_GROUP":
      return card.counterpartyPlayerId ? [card.counterpartyPlayerId] : [];
    case "COMBAT":
      return [card.attackerId, card.defenderId].filter((id): id is string => Boolean(id) && id !== me);
    case "SIEGE":
      return card.attackerIds.filter((id) => id !== me);
    case "TOWN_CAPTURED":
    case "TOWN_LOST":
    case "DOCK_CAPTURED":
    case "DOCK_LOST":
      return card.counterpartyPlayerId ? [card.counterpartyPlayerId] : [];
    default:
      return [];
  }
};

const dayKey = (at: number): string => {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** "TODAY", "YESTERDAY" or a short date, relative to now. */
export const dayHeading = (at: number, nowMs: number): string => {
  if (dayKey(at) === dayKey(nowMs)) return "TODAY";
  if (dayKey(at) === dayKey(nowMs - 86_400_000)) return "YESTERDAY";
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
};

export const chronicleGroups = (cards: readonly PersonalActivityCard[], me: string, rivalFilter: string, nowMs: number): Array<{ heading: string; cards: PersonalActivityCard[] }> => {
  const groups: Array<{ heading: string; cards: PersonalActivityCard[] }> = [];
  for (const card of [...cards].sort((a, b) => b.occurredAt - a.occurredAt)) {
    if (rivalFilter && !cardCounterparties(card, me).includes(rivalFilter)) continue;
    const heading = dayHeading(card.occurredAt, nowMs);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.cards.push(card);
    else groups.push({ heading, cards: [card] });
  }
  return groups;
};

const TONE_CLASS = { gain: "gain", loss: "loss", hold: "hold", neutral: "neutral" } as const;

const rowHtml = (card: PersonalActivityCard, input: ChronicleInput): string => {
  const tone = activityCardTone(card, input.me);
  const where = activityCardCoordinatesLabel(card);
  const text = activityCardText(card, input.me, input.nameOf, input.techName);
  const selected = card.id === input.selectedId ? " v2c-row-sel" : "";
  const show = card.kind === "TRUNCATION_NOTE"
    ? ""
    : `<button type="button" class="v2c-show" data-v2-chronicle-show="${esc(card.id)}" data-x="${card.x}" data-y="${card.y}">Show</button>`;
  return `<div class="v2c-row v2c-tone-${TONE_CLASS[tone]}${selected}">
    <span class="v2c-time">${activityCardTimeLabel(card)}</span>
    <span class="v2c-glyph" aria-hidden="true">${ACTIVITY_TONE_GLYPH[tone]}</span>
    <span class="v2c-text"><span class="v2c-what">${esc(text)}</span>${where ? `<span class="v2c-where">${esc(where)}</span>` : ""}</span>
    ${show}
  </div>`;
};

const crest = (name: string, color: string | undefined): string =>
  `<span class="v2c-crest" style="background:${esc(color ?? "#5a4828")}" aria-hidden="true">${esc((name.trim()[0] ?? "?").toUpperCase())}</span>`;

const summaryHtml = (timeline: PersonalActivityTimeline, input: ChronicleInput): string => {
  const s = timeline.summary;
  const chip = (value: string, label: string, tone: string): string => `<span class="v2c-chip"><b class="v2c-${tone}">${value}</b><span>${label}</span></span>`;
  const chips = [
    chip(`+${s.tilesClaimed}`, "claimed", "gain"),
    chip(`−${s.tilesLost}`, "lost", "loss"),
    s.townsLost > 0 || s.townsCaptured > 0 ? chip(`${s.townsCaptured - s.townsLost >= 0 ? "+" : "−"}${Math.abs(s.townsCaptured - s.townsLost)}`, "towns", s.townsCaptured >= s.townsLost ? "gain" : "loss") : chip("0", "towns", "neutral"),
    chip(String(s.buildingsCompleted), "built", "neutral")
  ].join("");
  const rivals = (timeline.rivals ?? []).slice(0, 2).map((r) => {
    const name = input.nameOf(r.playerId) ?? "Empire";
    return `<span class="v2c-rival">${crest(name, input.colorOf(r.playerId))}<b>${esc(name)}</b><span>+${r.tilesTaken} · −${r.tilesLost} · repelled ${r.attacksRepelled} · ${r.attacksFailed} failed</span></span>`;
  }).join("");
  return `<div class="v2c-summary"><span class="v2c-summary-h">Last 24 hours</span><div class="v2c-chips">${chips}</div>${rivals}</div>`;
};

const filtersHtml = (timeline: PersonalActivityTimeline, input: ChronicleInput): string => {
  const ids = (timeline.rivals ?? []).map((r) => r.playerId);
  if (ids.length === 0) return "";
  const btn = (id: string, label: string): string =>
    `<button type="button" role="tab" class="v2c-filter${input.rivalFilter === id ? " v2c-filter-on" : ""}" aria-selected="${input.rivalFilter === id}" data-v2-chronicle-filter="${esc(id)}">${esc(label)}</button>`;
  return `<div class="v2c-filters" role="tablist" aria-label="Filter by rival">${btn("", "All")}${ids.map((id) => btn(id, input.nameOf(id) ?? "Empire")).join("")}</div>`;
};

/** Title, close and (when given) the Yours / World / Updates tabs. */
export const chronicleHeadHtml = (tabs = ""): string =>
  `<div class="v2c-head"><span class="v2c-title">Chronicle</span><button type="button" class="v2c-close" data-v2-close aria-label="Close Chronicle">Esc ✕</button></div>${tabs}`;

export const chronicleHtml = (input: ChronicleInput, tabs = ""): string => {
  const head = chronicleHeadHtml(tabs);
  const timeline = input.timeline;
  if (!timeline) {
    const msg = input.error ?? (input.loading ? "Loading…" : "No activity yet");
    return `${head}<div class="v2s-empty">${esc(msg)}</div>`;
  }
  const groups = chronicleGroups(timeline.cards, input.me, input.rivalFilter, input.nowMs);
  const list = groups.length > 0
    ? groups.map((g) => `<div class="v2c-day">${g.heading}</div>${g.cards.map((c) => rowHtml(c, input)).join("")}`).join("")
    : `<div class="v2s-empty">No activity in the last 24 hours</div>`;
  return `${head}${summaryHtml(timeline, input)}${filtersHtml(timeline, input)}<div class="v2c-list" data-v2-scroll="chronicle">${list}</div>`;
};

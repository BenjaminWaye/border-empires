// Chronicle for the new HUD: a drawer over the live map built from the 24h
// personal activity timeline. Every event that happened somewhere has a Show
// button that flies the camera there; rivals filter one timeline.

import type { PersonalActivityCard, PersonalActivityTimeline } from "@border-empires/game-domain";
import { activityCardCoordinates, activityCardCoordinatesLabel, activityCardText, activityCardTimeLabel } from "../client-activity-dashboard/client-activity-dashboard-format.js";
import { activityCardTone, ACTIVITY_TONE_GLYPH } from "../client-activity-dashboard/client-activity-dashboard-tone.js";
import { localDayKey } from "../client-activity-dashboard/client-activity-dashboard-time.js";
import { chronicleHeadlineHtml, type ChronicleRespawn } from "./client-hud-v2-chronicle-headline.js";

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
  /** The read watermark when the Chronicle opened: losses after it are pinned to the top. */
  awaySince?: number | undefined;
  /** The latest respawn notice, so the headline can say the empire was wiped out and restarted. */
  respawn?: ChronicleRespawn | undefined;
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
    case "MUSTER_CAPTURED":
    case "MUSTER_LOST":
      return card.counterpartyPlayerId ? [card.counterpartyPlayerId] : [];
    case "DIPLOMACY":
    case "SUPPLY_ENDED":
      return [card.counterpartyPlayerId];
    default:
      return [];
  }
};

const dayKey = localDayKey;

/** "TODAY", "YESTERDAY" or a short date, relative to now. */
export const dayHeading = (at: number, nowMs: number): string => {
  if (dayKey(at) === dayKey(nowMs)) return "TODAY";
  if (dayKey(at) === dayKey(nowMs - 86_400_000)) return "YESTERDAY";
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
};

export const AWAY_LOSSES_HEADING = "LOST WHILE YOU WERE AWAY";

/**
 * Day groups, newest first. With `awaySince`, losses after it (what the player
 * has not read yet) come first under their own heading, so a returning player
 * sees what they lost before anything else; they are not repeated below.
 */
export const chronicleGroups = (cards: readonly PersonalActivityCard[], me: string, rivalFilter: string, nowMs: number, awaySince?: number): Array<{ heading: string; cards: PersonalActivityCard[] }> => {
  const groups: Array<{ heading: string; cards: PersonalActivityCard[] }> = [];
  const sorted = [...cards].sort((a, b) => b.occurredAt - a.occurredAt).filter((card) => !rivalFilter || cardCounterparties(card, me).includes(rivalFilter));
  // Your own failed attacks read as losses too, but nothing was taken from you while away.
  const ownAttack = (card: PersonalActivityCard): boolean =>
    (card.kind === "COMBAT" && card.attackerId === me) || (card.kind === "COMBAT_GROUP" && card.role === "ATTACKER");
  const isAwayLoss = (card: PersonalActivityCard): boolean =>
    awaySince !== undefined && card.occurredAt > awaySince && activityCardTone(card, me) === "loss" && !ownAttack(card);
  const awayLosses = sorted.filter(isAwayLoss);
  if (awayLosses.length > 0) groups.push({ heading: AWAY_LOSSES_HEADING, cards: awayLosses });
  for (const card of sorted) {
    if (isAwayLoss(card)) continue;
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
  const text = activityCardText(card, input.me, input.nameOf, input.techName, input.nowMs);
  const selected = card.id === input.selectedId ? " v2c-row-sel" : "";
  const coords = activityCardCoordinates(card);
  const show = coords
    ? `<button type="button" class="v2c-show" data-v2-chronicle-show="${esc(card.id)}" data-x="${coords.x}" data-y="${coords.y}">Show</button>`
    : "";
  return `<div class="v2c-row v2c-tone-${TONE_CLASS[tone]}${selected}">
    <span class="v2c-time">${activityCardTimeLabel(card, input.nowMs)}</span>
    <span class="v2c-glyph" aria-hidden="true">${ACTIVITY_TONE_GLYPH[tone]}</span>
    <span class="v2c-text"><span class="v2c-what">${esc(text)}</span>${where ? `<span class="v2c-where">${esc(where)}</span>` : ""}</span>
    ${show}
  </div>`;
};

const crest = (name: string, color: string | undefined): string =>
  `<span class="v2c-crest" style="background:${esc(color ?? "#5a4828")}" aria-hidden="true">${esc((name.trim()[0] ?? "?").toUpperCase())}</span>`;

/** One rival's head-to-head line in words: "took 11 of your tiles · you held off 2 attacks". */
export const rivalTallyText = (r: NonNullable<PersonalActivityTimeline["rivals"]>[number]): string => {
  const tiles = (n: number): string => `${n} tile${n === 1 ? "" : "s"}`;
  const attacks = (n: number): string => `${n} attack${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (r.tilesLost > 0) parts.push(`took ${r.tilesLost} of your tiles`);
  if (r.tilesTaken > 0) parts.push(`you took ${tiles(r.tilesTaken)}`);
  if (r.attacksRepelled > 0) parts.push(`you held off ${attacks(r.attacksRepelled)}`);
  if (r.attacksFailed > 0) parts.push(`${attacks(r.attacksFailed)} of yours failed`);
  return parts.length > 0 ? parts.join(" · ") : "no ground changed hands";
};

const summaryHtml = (timeline: PersonalActivityTimeline, input: ChronicleInput): string => {
  const s = timeline.summary;
  const chip = (value: string, label: string, tone: string): string => `<span class="v2c-chip"><b class="v2c-${tone}">${value}</b><span>${label}</span></span>`;
  const chips = [
    chip(`+${s.tilesClaimed}`, "claimed", "gain"),
    chip(`−${s.tilesLost}`, "lost", "loss"),
    // Towns taken and lost each get their own count: a net "+1 towns" read as how many towns you hold.
    ...(s.townsCaptured > 0 ? [chip(`+${s.townsCaptured}`, s.townsCaptured === 1 ? "town taken" : "towns taken", "gain")] : []),
    chip(s.townsLost > 0 ? `−${s.townsLost}` : "0", s.townsLost === 1 ? "town lost" : "towns lost", s.townsLost > 0 ? "loss" : "neutral"),
    chip(String(s.buildingsCompleted), "built", "neutral")
  ].join("");
  const rivals = (timeline.rivals ?? []).slice(0, 2).map((r) => {
    const name = input.nameOf(r.playerId) ?? "Empire";
    return `<span class="v2c-rival">${crest(name, input.colorOf(r.playerId))}<b>${esc(name)}</b><span>${esc(rivalTallyText(r))}</span></span>`;
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
  `<div class="v2c-head"><span class="v2c-title">Chronicle</span><button type="button" class="v2c-close" data-v2-close aria-label="Close Chronicle"><span class="v2-key-hint">Esc </span>✕</button></div>${tabs}`;

export const chronicleHtml = (input: ChronicleInput, tabs = ""): string => {
  const head = chronicleHeadHtml(tabs);
  const timeline = input.timeline;
  if (!timeline) {
    const msg = input.error ?? (input.loading ? "Loading…" : "No activity yet");
    return `${head}<div class="v2s-empty">${esc(msg)}</div>`;
  }
  const groups = chronicleGroups(timeline.cards, input.me, input.rivalFilter, input.nowMs, input.awaySince);
  const list = groups.length > 0
    ? groups.map((g) => `<div class="v2c-day${g.heading === AWAY_LOSSES_HEADING ? " v2c-day-away" : ""}">${g.heading}</div>${g.cards.map((c) => rowHtml(c, input)).join("")}`).join("")
    : `<div class="v2s-empty">No activity in the last 24 hours</div>`;
  // A returning player gets a short "since you left" headline above everything else.
  const headline = input.awaySince === undefined
    ? ""
    : chronicleHeadlineHtml({ me: input.me, timeline, awaySince: input.awaySince, respawn: input.respawn, nameOf: input.nameOf });
  return `${head}${headline}${summaryHtml(timeline, input)}${filtersHtml(timeline, input)}<div class="v2c-list" data-v2-scroll="chronicle">${list}</div>`;
};

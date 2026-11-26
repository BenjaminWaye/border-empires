// The town screen's Town focus card (docs/town-focus-plan.md): one selectable
// row per focus with its icon, its rule, and this town's own Coin per day,
// manpower per refill and time to its next tier, each against Balanced. The
// refill countdown is pinned in the header; an empire line shows how all your
// towns are set. On phones the rows become a 2×2 grid of tiles (CSS).
import type { TownFocus } from "@border-empires/shared";
import { townFocusDuration, townFocusFirstPayoutInMs, townFocusName, type TownFocusCard, type TownFocusOption, type TownFocusStat } from "../client-town-focus/client-town-focus.js";

export type TownFocusCardExtras = {
  /** How many of the player's towns run each focus. */
  counts?: Record<TownFocus, number>;
  /** Manpower per refill the player's town focuses add or remove in total (the breakdown's "Town focus" line). */
  empireManpowerPerRefill?: number;
  /** Coin per day the player's town focuses add or remove in total. */
  empireCoinPerDay?: number;
  /** The focus the player just picked on this town, for a short confirmation flash. */
  flash?: TownFocus;
};

/** Countdown to a refill, to the minute: "37m", "1h 37m". Longer spans use the card's coarser format. */
const until = (ms: number): string => {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  if (minutes >= 24 * 60) return townFocusDuration(minutes);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 16px line icons: scales, sprout, helmet, coin.
/** The rule with its gain picked out in the focus colour: "<b>Manpower +20%</b> · Coin −10% · Growth −10%". */
const ruleHtml = (rule: string): string => {
  const [gain, ...costs] = rule.split(" · ");
  return costs.length === 0 ? esc(rule) : `<span class="v2tf-gain">${esc(gain ?? "")}</span> · ${esc(costs.join(" · "))}`;
};

const ICONS: Readonly<Record<TownFocus, string>> = {
  BALANCED: '<path d="M8 2v12M4 14h8M3 5h10M3 5 1 9h4L3 5Zm10 0-2 4h4l-2-4Z"/>',
  GROWTH: '<path d="M8 14V7m0 0C8 4 6 2.5 3 2.5 3 5.5 5 7 8 7Zm0 2c0-3 2-4.5 5-4.5 0 3-2 4.5-5 4.5ZM4 14h8"/>',
  LEVY: '<path d="M3 9a5 5 0 0 1 10 0v2H3V9Zm0 2v2.5h3V11m7 0v2.5h-3V11M8 4V2"/>',
  COMMERCE: '<circle cx="8" cy="8" r="6"/><path d="M10 5.8C9.6 5.3 8.9 5 8 5c-1.2 0-2 .6-2 1.5S6.8 8 8 8s2 .5 2 1.5S9.2 11 8 11c-.9 0-1.6-.3-2-.8M8 3.8V5m0 6v1.2"/>'
};
const icon = (focus: TownFocus): string =>
  `<svg class="v2tf-ico" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICONS[focus]}</svg>`;

const cell = (s: TownFocusStat, paused = false): string =>
  `<span class="v2tf-cell${paused ? " v2tf-cell-paused" : ""}"><span class="v2tf-v">${esc(s.value)}</span><span class="v2tf-d v2tf-${s.tone}">${esc(s.delta)}</span></span>`;

const stateBadge = (option: TownFocusOption): string =>
  option.state === "active" ? `<span class="v2tf-badge v2tf-badge-active">Active</span>`
    : option.state === "queued" ? `<span class="v2tf-badge v2tf-badge-queued">Next</span>` : "";

const rowHtml = (option: TownFocusOption, card: TownFocusCard, flash: TownFocus | undefined): string => {
  const title = option.state === "active" && card.queued
    ? `Keep ${option.name}: cancels the queued ${townFocusName(card.queued)} focus`
    : option.state === "idle" ? `${option.tagline}. Switch to ${option.name} at your next refill, in ${until(card.startsInMs)}.` : `${option.tagline}.`;
  return `<button type="button" class="v2tf-row v2tf-${option.state} v2tf-f-${option.focus.toLowerCase()}${flash === option.focus ? " v2tf-flash" : ""}" data-v2-town-focus="${option.focus}" aria-pressed="${option.state !== "idle"}" title="${esc(title)}">
      <span class="v2tf-mark">${icon(option.focus)}</span>
      <span class="v2tf-name">${esc(option.name)}<span class="v2tf-phone-badge">${stateBadge(option)}</span></span>
      ${cell(option.coin)}${cell(option.manpower)}${cell(option.growth, card.growthPaused)}
      <span class="v2tf-rule">${stateBadge(option)}<span>${ruleHtml(option.rule)}</span></span>
      ${option.state !== "idle" && option.focus !== "BALANCED" ? `<span class="v2tf-flavour">${esc(option.tagline)}</span>` : ""}
      <span class="v2tf-trade"><span class="v2tf-gain">${esc(option.tradeLine)}</span><span class="v2tf-cost">${esc(option.costLine)}</span></span>
    </button>`;
};

const strong = (text: string): string => `<span class="v2tf-em">${esc(text)}</span>`;

const footer = (card: TownFocusCard): string =>
  card.queued
    ? `${strong(townFocusName(card.queued))} starts in ${strong(until(card.queuedInMs))}` +
      (card.queued === "LEVY" ? `; its first extra manpower comes in ${esc(until(townFocusFirstPayoutInMs(card.queuedInMs)))}` : "") +
      `. Pick ${strong(townFocusName(card.active))} to cancel; nothing is lost.`
    : `Free to switch as often as you like; the focus set at the refill is the one that counts. ` +
      `<span class="v2tf-tip">Tip: Levy before a big push, Growth while it's quiet, Commerce when saving Coin.</span>`;

const applyAll = (card: TownFocusCard, extras: TownFocusCardExtras): string => {
  const counts = extras.counts;
  const total = counts ? counts.BALANCED + counts.GROWTH + counts.LEVY + counts.COMMERCE : 0;
  const focus = card.queued ?? card.active;
  if (total < 2 || (counts?.[focus] ?? 0) >= total) return "";
  return `<button type="button" class="v2tf-all" data-v2-town-focus="${focus}" data-v2-town-focus-all="1" title="Queue ${esc(townFocusName(focus))} on every one of your towns for the next refill">Apply ${esc(townFocusName(focus))} to all ${total} towns</button>`;
};

const signedRound = (value: number | undefined): string | undefined =>
  value === undefined || Math.round(value) === 0 ? undefined : `${Math.round(value) > 0 ? "+" : "−"}${Math.abs(Math.round(value))}`;

/** All towns at once: how they are set, and the net effect against every town on Balanced. */
const empireLine = (extras: TownFocusCardExtras): string => {
  const counts = extras.counts;
  if (!counts) return "";
  const total = counts.BALANCED + counts.GROWTH + counts.LEVY + counts.COMMERCE;
  const segs = (["GROWTH", "LEVY", "COMMERCE", "BALANCED"] as const).filter((f) => counts[f] > 0);
  const bar = segs.map((f) => `<span class="v2tf-seg v2tf-f-${f.toLowerCase()}" style="flex:${counts[f]}" title="${counts[f]} ${townFocusName(f)}"></span>`).join("");
  const mix = segs.map((f) => `${counts[f]} ${townFocusName(f)}`).join(" · ");
  const mp = signedRound(extras.empireManpowerPerRefill);
  const coin = signedRound(extras.empireCoinPerDay);
  const net = [mp ? `${mp} MP per refill` : "", coin ? `${coin} Coin per day` : ""].filter(Boolean).join(" · ");
  return `<div class="v2tf-empire" title="${esc(`All your towns: ${mix}${net ? `. Net ${net} compared with every town on Balanced` : ""}`)}">` +
    `<div class="v2tf-empire-row"><span>All ${total} ${total === 1 ? "town" : "towns"}</span><span class="v2tf-bar">${bar}</span>${mp ? `<span class="v2tf-net">${esc(mp)} MP/refill</span>` : ""}</div>` +
    `<div class="v2tf-empire-mix">${esc(mix)}${coin ? ` · ${esc(coin)} Coin/day` : ""}</div></div>`;
};

export const townFocusCardHtml = (card: TownFocusCard | undefined, extras: TownFocusCardExtras = {}): string =>
  card
    ? `<div class="v2tf" role="group" aria-label="Town focus">
        <div class="v2tf-top"><span class="v2tf-h">Town focus</span><span class="v2tf-clock">${card.queued ? `<span class="v2tf-next">${esc(townFocusName(card.queued))} next</span> · ` : "Next refill "}<span class="v2tf-em">${esc(until(card.queued ? card.queuedInMs : card.startsInMs))}</span></span></div>
        ${empireLine(extras)}
        <div class="v2tf-head"><span></span><span class="v2tf-colname">This town<br>vs Balanced</span><span class="v2tf-col">Coin<small>per day</small></span><span class="v2tf-col" title="MP is manpower. It refills every 4 hours: 6 refills a day.">MP<small>per refill</small></span><span class="v2tf-col">${esc(card.growthLabel)}<small>${card.growthEstimated ? "once growing" : "time"}</small></span></div>
        ${card.growthPaused ? `<div class="v2tf-paused">Growth paused: times show once it resumes</div>` : ""}
        <div class="v2tf-rows">${card.options.map((option) => rowHtml(option, card, extras.flash)).join("")}</div>
        <div class="v2tf-foot${card.queued ? "" : " v2tf-foot-idle"}">${footer(card)}</div>
        ${applyAll(card, extras)}
      </div>`
    : "";

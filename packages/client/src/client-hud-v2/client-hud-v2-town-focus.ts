// The town screen's Town focus card (docs/town-focus-plan.md), sized to fit the
// town panel without scrolling: one row of four focus buttons (icon, name and
// what each gives), then one detail strip with this town's Coin per day, MP per
// refill and time to its next tier under the focus being looked at, against
// Balanced. The strip shows the queued or active focus, and switches to any
// button the pointer is over (CSS :has), so comparing costs no clicks.
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
  /** "Apply to all" was pressed once and waits for a second press to confirm. */
  confirmAll?: boolean;
  /** The focus the refill has just made active on this town, for a short glow. */
  arrived?: TownFocus;
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
const ICONS: Readonly<Record<TownFocus, string>> = {
  BALANCED: '<path d="M8 2v12M4 14h8M3 5h10M3 5 1 9h4L3 5Zm10 0-2 4h4l-2-4Z"/>',
  GROWTH: '<path d="M8 14V7m0 0C8 4 6 2.5 3 2.5 3 5.5 5 7 8 7Zm0 2c0-3 2-4.5 5-4.5 0 3-2 4.5-5 4.5ZM4 14h8"/>',
  LEVY: '<path d="M3 9a5 5 0 0 1 10 0v2H3V9Zm0 2v2.5h3V11m7 0v2.5h-3V11M8 4V2"/>',
  COMMERCE: '<circle cx="8" cy="8" r="6"/><path d="M10 5.8C9.6 5.3 8.9 5 8 5c-1.2 0-2 .6-2 1.5S6.8 8 8 8s2 .5 2 1.5S9.2 11 8 11c-.9 0-1.6-.3-2-.8M8 3.8V5m0 6v1.2"/>'
};
const icon = (focus: TownFocus): string =>
  `<svg class="v2tf-ico" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[focus]}</svg>`;

const key = (focus: TownFocus): string => focus.toLowerCase();

const optionButton = (option: TownFocusOption, card: TownFocusCard, flash: TownFocus | undefined, arrived: TownFocus | undefined): string => {
  const title = option.state === "active" && card.queued
    ? `Keep ${option.name}: cancels the queued ${townFocusName(card.queued)} focus`
    : `${option.tagline}. ${option.rule}.${option.state === "idle" ? ` Starts at your next refill, in ${until(card.startsInMs)}.` : ""}`;
  const state = option.state === "active" ? "Active" : option.state === "queued" ? "Next" : "";
  return `<button type="button" class="v2tf-opt v2tf-${option.state} v2tf-f-${key(option.focus)}${flash === option.focus ? " v2tf-flash" : ""}${arrived === option.focus && option.state === "active" ? " v2tf-just-active" : ""}" data-v2-town-focus="${option.focus}" aria-pressed="${option.state !== "idle"}" title="${esc(title)}">
      ${state ? `<span class="v2tf-state">${state}</span>` : ""}<span class="v2tf-title">${icon(option.focus)}<span class="v2tf-name">${esc(option.name)}</span></span>
      <span class="v2tf-gain${card.growthPaused && option.focus === "GROWTH" ? " v2tf-gain-paused" : ""}">${esc(option.tradeLine)}</span>
      <span class="v2tf-cost">${esc(option.costLine.split(" · ")[0] ?? "")}</span>
    </button>`;
};

const cell = (label: string, unit: string, s: TownFocusStat): string =>
  `<span class="v2tf-cell"><span class="v2tf-k">${label}</span><span class="v2tf-v">${esc(s.value)}<small>${unit}</small></span><span class="v2tf-d v2tf-${s.tone}">${esc(s.delta)}</span></span>`;

/** One detail strip per option; CSS shows the hovered one, else the queued, else the active. */
const detail = (option: TownFocusOption, card: TownFocusCard): string =>
  `<div class="v2tf-detail v2tf-detail-${key(option.focus)}${option.focus === (card.queued ?? card.active) ? " v2tf-detail-default" : ""}">
      <span class="v2tf-detail-h">${option.state === "idle" ? `<span class="v2tf-preview">Preview</span>` : ""}<span class="v2tf-detail-name v2tf-f-${key(option.focus)}" title="${esc(option.tagline)}">${esc(option.name)}</span><span class="v2tf-rule">${esc(option.rule)}</span></span>
      ${cell("Coin", "/day", option.coin)}${cell("MP", "/refill", option.manpower)}${cell(`<span class="v2tf-k-long">${esc(card.growthLabel.replace(/^To /, ""))} in</span><span class="v2tf-k-short">${esc(card.growthLabel.replace(/^To /, ""))}</span>`, "", option.growth)}
    </div>`;

/** One signed figure, "+24" or "−9", coloured by sign; "±0" when it rounds to nothing. */
const figure = (value: number): string => {
  const rounded = Math.round(value);
  return rounded === 0 ? `<b class="v2tf-same">±0</b>` : `<b class="v2tf-${rounded > 0 ? "up" : "down"}">${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}</b>`;
};

/**
 * One line for the whole empire against all Balanced: "All towns +24 MP/refill · −9 Coin/day". With a change
 * queued on this town it shows where each total goes at the refill: "All towns +24 → +48 MP/refill · −9 → −18 Coin/day".
 */
const empireText = (card: TownFocusCard, extras: TownFocusCardExtras): string => {
  const mpNow = extras.empireManpowerPerRefill ?? 0;
  const coinNow = extras.empireCoinPerDay ?? 0;
  const queued = card.queued ? card.options.find((o) => o.focus === card.queued) : undefined;
  const active = card.options.find((o) => o.focus === card.active);
  const diff = (s: TownFocusStat | undefined): number => (s?.delta ? Number(s.delta.replace("−", "-")) : 0);
  const mpAfter = queued && active ? mpNow + diff(queued.manpower) - diff(active.manpower) : undefined;
  const coinAfter = queued && active ? coinNow + diff(queued.coin) - diff(active.coin) : undefined;
  const moves = (now: number, after: number | undefined): string => `${figure(now)}${after !== undefined && Math.round(after) !== Math.round(now) ? ` → ${figure(after)}` : ""}`;
  if (Math.round(mpNow) === 0 && Math.round(coinNow) === 0 && mpAfter === undefined) return "";
  return `<span class="v2tf-empire" title="Every town's focus added up, against every town on Balanced. With a change queued here, the arrow shows the total from the next refill.">All towns vs Balanced ${moves(mpNow, mpAfter)} MP · ${moves(coinNow, coinAfter)} Coin/day</span>`;
};

const statusLine = (card: TownFocusCard, extras: TownFocusCardExtras): string => {
  const strong = (text: string): string => `<b>${esc(text)}</b>`;
  const text = card.queued
    ? `${strong(townFocusName(card.queued))} starts in ${strong(until(card.queuedInMs))}` +
      (card.queued === "LEVY" ? `, first extra MP in ${esc(until(townFocusFirstPayoutInMs(card.queuedInMs)))}` : "") +
      `. Pick ${esc(townFocusName(card.active))} to cancel.`
    : card.growthPaused ? `Growth is paused here; Coin and MP still change.`
    : `Free to change<br>Starts at next refill`;
  const counts = extras.counts;
  const total = counts ? counts.BALANCED + counts.GROWTH + counts.LEVY + counts.COMMERCE : 0;
  const focus = card.queued ?? card.active;
  const changing = counts ? total - counts[focus] : 0;
  const all = total >= 2 && changing > 0
    ? `<button type="button" class="v2tf-all${extras.confirmAll ? " v2tf-all-confirm" : ""}" data-v2-town-focus="${focus}" data-v2-town-focus-all="1" title="Queue ${esc(townFocusName(focus))} on all ${total} of your towns for the next refill. Each town can still be changed back before then.">${extras.confirmAll ? `Again to confirm: ${changing} ${changing === 1 ? "town" : "towns"} → ${esc(townFocusName(focus))}` : `All towns → ${esc(townFocusName(focus))}`}</button>`
    : "";
  const empire = empireText(card, extras);
  return `<div class="v2tf-status"><span>${text}</span>${all}</div>${empire ? `<div class="v2tf-empire-row">${empire}</div>` : ""}`;
};

/** Phones have no room for the empire line, so its MP total rides in the header (" · All +48 MP"). */
const phoneEmpire = (extras: TownFocusCardExtras): string => {
  const mp = extras.empireManpowerPerRefill;
  return mp !== undefined && Math.round(mp) !== 0 ? `<span class="v2tf-phone-only"> · All ${figure(mp)} MP</span>` : "";
};

export const townFocusCardHtml = (card: TownFocusCard | undefined, extras: TownFocusCardExtras = {}): string => {
  if (!card) return "";
  return `<div class="v2tf" role="group" aria-label="Town focus">
      <div class="v2tf-top"><span class="v2tf-h">Town focus</span><span class="v2tf-clock">${card.queued ? `<span class="v2tf-next">${esc(townFocusName(card.queued))} next</span> · ` : "Next refill "}<b>${esc(until(card.queued ? card.queuedInMs : card.startsInMs))}</b>${phoneEmpire(extras)}</span></div>
      <div class="v2tf-opts">${card.options.map((option) => optionButton(option, card, extras.flash, extras.arrived)).join("")}</div>
      <div class="v2tf-details">${card.options.map((option) => detail(option, card)).join("")}</div>
      ${card.queued ? `<div class="v2tf-phone-hint">${card.queued === "LEVY" ? `Extra MP from ${esc(until(townFocusFirstPayoutInMs(card.queuedInMs)))} · ` : ""}tap ${esc(townFocusName(card.active))} to cancel</div>` : ""}
      ${statusLine(card, extras)}
    </div>`;
};

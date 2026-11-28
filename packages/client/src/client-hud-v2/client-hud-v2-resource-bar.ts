// Top resource bar for the new HUD: Coin with its net daily rate, the four slot
// resources as free capacity (a minus shortfall when over), and Integrity plus Settings.
// Manpower lives in the orb, not here.

import { formatCoinPerDay, spendableCoin, type SlotResource } from "@border-empires/shared";
import { resourceSimpleIconUrl } from "../client-resource-icons/client-resource-icons.js";
import { INTEGRITY_HINT } from "./client-hud-v2-hints.js";
import { hudExplainAttr, type HudExplainKey } from "../client-hud-explain/client-hud-explain.js";

export const NET_COIN_TITLE = "Net coin per day: income less coin upkeep";

export type ResourceBarInput = {
  gold: number;
  /** Net coin per minute: income less coin upkeep, the figure Economy shows. */
  netPerMinute: number;
  slotSupply: Readonly<Record<SlotResource, number>>;
  slotDemand: Readonly<Record<SlotResource, number>>;
  integrityPct: number | undefined;
  /** Titanium/Crystal/Umbrite stay off the bar until researched (or until they have slots or users); Food always shows. */
  isRevealed?: (resource: SlotResource) => boolean;
  /** After INIT, until the first full PLAYER_UPDATE: slot and Integrity chips show "…", not stale numbers. */
  pending?: boolean;
};

const PENDING_HTML = `<span class="hud-v2-chip-value hud-v2-chip-pending" aria-label="Loading">…</span>`;

const SLOT_ORDER: ReadonlyArray<[SlotResource, string]> = [
  ["FOOD", "Food"],
  ["TITANIUM", "Titanium"],
  ["CRYSTAL", "Crystal"],
  ["UMBRITE", "Umbrite"]
];

const fmt = (value: number): string => Math.round(value).toLocaleString("en-US");
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 });

/** Cut to 3 significant digits toward zero, so the compact form never rounds up (12,960 → 12.9K, not 13K). */
const truncateToCompactDigits = (value: number): number => {
  if (value === 0 || !Number.isFinite(value)) return value;
  const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 2);
  return Math.trunc(value / step) * step;
};

const chipNumberHtml = (value: number): string => {
  const exact = fmt(value);
  if (Math.abs(Math.round(value)) < 1_000) return exact;
  return `<span class="hud-v2-chip-exact">${exact}</span><span class="hud-v2-chip-short" aria-hidden="true">${compactNumber.format(truncateToCompactDigits(value))}</span>`;
};

/** Over capacity is the only warning state: full slots are normal. */
export const slotChipState = (used: number, total: number): "normal" | "over" => (used > total ? "over" : "normal");

const chip = (key: string, label: string, valueHtml: string, iconUrl?: string, title?: string, explain?: HudExplainKey): string => {
  const icon = iconUrl ? `<img class="hud-v2-chip-icon" src="${iconUrl}" alt="" draggable="false">` : "";
  const hover = title ? ` title="${title}"` : "";
  return `<button type="button" class="hud-v2-chip" data-hud-v2-chip="${key}"${explain ? hudExplainAttr(explain) : ""}${hover}><span class="hud-v2-chip-label">${icon}<span class="hud-v2-chip-name">${label}</span></span>${valueHtml}</button>`;
};

export const resourceBarHtml = (input: ResourceBarInput): string => {
  // The one coin-rate format (shared formatCoinPerDay), so the chip reads exactly what Economy's
  // headline reads: it rounded to whole coin and showed 24 beside Economy's 23.6.
  const rateTone = input.netPerMinute < 0 ? " hud-v2-chip-rate-loss" : "";
  const coin = chip(
    "coin",
    "Coin",
    `<span class="hud-v2-chip-value">${chipNumberHtml(spendableCoin(input.gold))}</span><span class="hud-v2-chip-rate${rateTone}" title="${NET_COIN_TITLE}">${formatCoinPerDay(input.netPerMinute)}</span>`,
    resourceSimpleIconUrl("GOLD")
  );
  const shown = (key: SlotResource): boolean =>
    key === "FOOD" || !input.isRevealed || input.isRevealed(key) || (input.slotSupply[key] ?? 0) > 0 || (input.slotDemand[key] ?? 0) > 0;
  const slots = SLOT_ORDER.filter(([key]) => shown(key)).map(([key, label]) => {
    const used = Math.max(0, input.slotDemand[key] ?? 0);
    const total = Math.max(0, input.slotSupply[key] ?? 0);
    const over = slotChipState(used, total) === "over";
    const remaining = total - used;
    // A shortfall carries a minus sign so it can't be read as free slots by colour alone.
    const amount = `${over ? "−" : ""}${chipNumberHtml(Math.abs(remaining))}`;
    // A visible unit: a bare "4" beside Economy's "3 / 7" read as two different food numbers (playtest 2026-11-27).
    const unit = over ? " short" : " free";
    const tone = over ? "hud-v2-over" : remaining > 0 ? "hud-v2-chip-available" : "hud-v2-chip-zero";
    const summary = input.pending ? PENDING_HTML : `<span class="hud-v2-chip-summary ${tone}">${amount}<span class="hud-v2-chip-unit">${unit}</span></span>`;
    // The bar shows only free slots; hover keeps the totals one step away (desktop has no icon cue).
    const title = `${label}: ${fmt(Math.abs(remaining))}${over ? " slots short" : " free slots"} (${fmt(used)} / ${fmt(total)} used)`;
    return chip(key.toLowerCase(), label, summary, resourceSimpleIconUrl(key), input.pending ? undefined : title);
  }).join("");
  const integrity = input.integrityPct === undefined
    ? ""
    : chip("integrity", "Integrity", input.pending ? PENDING_HTML : `<span class="hud-v2-chip-value">${Math.round(input.integrityPct)}%</span>`, undefined, INTEGRITY_HINT, "integrity");
  const gear = `<button type="button" class="hud-v2-gear" data-hud-v2-open="settings" aria-label="Settings" title="Settings · Esc"><span aria-hidden="true">⚙</span><img src="/icons/nav/settings.svg" alt="" draggable="false"></button>`;
  return `${coin}${slots}<span class="hud-v2-sep" aria-hidden="true"></span>${integrity}${gear}`;
};

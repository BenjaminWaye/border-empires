// Top resource bar for the new HUD: Coin with its net daily rate, the four slot
// resources as used / total on desktop or free capacity on phones, and Integrity plus Settings.
// Manpower lives in the orb, not here.

import type { SlotResource } from "@border-empires/shared";
import { resourceSimpleIconUrl } from "../client-resource-icons/client-resource-icons.js";

export type ResourceBarInput = {
  gold: number;
  /** Net coin per minute: income less coin upkeep, the figure Economy shows. */
  netPerMinute: number;
  slotSupply: Readonly<Record<SlotResource, number>>;
  slotDemand: Readonly<Record<SlotResource, number>>;
  integrityPct: number | undefined;
  /** Titanium/Crystal/Umbrite stay off the bar until researched (or until they have slots or users); Food always shows. */
  isRevealed?: (resource: SlotResource) => boolean;
};

const SLOT_ORDER: ReadonlyArray<[SlotResource, string]> = [
  ["FOOD", "Food"],
  ["TITANIUM", "Titanium"],
  ["CRYSTAL", "Crystal"],
  ["UMBRITE", "Umbrite"]
];

const fmt = (value: number): string => Math.round(value).toLocaleString("en-US");
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 3 });

const chipNumberHtml = (value: number): string => {
  const exact = fmt(value);
  if (Math.abs(Math.round(value)) < 1_000) return exact;
  return `<span class="hud-v2-chip-exact">${exact}</span><span class="hud-v2-chip-short" aria-hidden="true">${compactNumber.format(value)}</span>`;
};

/** Over capacity is the only warning state: full slots are normal. */
export const slotChipState = (used: number, total: number): "normal" | "over" => (used > total ? "over" : "normal");

const chip = (key: string, label: string, valueHtml: string, iconUrl?: string): string => {
  const icon = iconUrl ? `<img class="hud-v2-chip-icon" src="${iconUrl}" alt="" draggable="false">` : "";
  return `<button type="button" class="hud-v2-chip" data-hud-v2-chip="${key}"><span class="hud-v2-chip-label">${icon}<span class="hud-v2-chip-name">${label}</span></span>${valueHtml}</button>`;
};

export const resourceBarHtml = (input: ResourceBarInput): string => {
  // Per day, like Economy and the tile panel.
  const ratePerDay = input.netPerMinute * 1440;
  const rateSign = ratePerDay >= 0 ? "+" : "−";
  const rateTone = ratePerDay < 0 ? " hud-v2-chip-rate-loss" : "";
  const coin = chip(
    "coin",
    "Coin",
    `<span class="hud-v2-chip-value">${chipNumberHtml(input.gold)}</span><span class="hud-v2-chip-rate${rateTone}">${rateSign}${fmt(Math.abs(ratePerDay))}/day</span>`,
    resourceSimpleIconUrl("GOLD")
  );
  const shown = (key: SlotResource): boolean =>
    key === "FOOD" || !input.isRevealed || input.isRevealed(key) || (input.slotSupply[key] ?? 0) > 0 || (input.slotDemand[key] ?? 0) > 0;
  const slots = SLOT_ORDER.filter(([key]) => shown(key)).map(([key, label]) => {
    const used = Math.max(0, input.slotDemand[key] ?? 0);
    const total = Math.max(0, input.slotSupply[key] ?? 0);
    const over = slotChipState(used, total) === "over";
    const usedHtml = over ? `<b class="hud-v2-over">${fmt(used)}</b>` : `<span class="hud-v2-chip-value">${fmt(used)}</span>`;
    const desktop = `<span class="hud-v2-chip-slot">${usedHtml}<span class="hud-v2-chip-of">/${fmt(total)}</span></span>`;
    const remaining = total - used;
    const amount = chipNumberHtml(Math.abs(remaining));
    const description = over ? " slots short" : " free slots";
    const tone = over ? "hud-v2-over" : remaining > 0 ? "hud-v2-chip-available" : "hud-v2-chip-zero";
    const summary = `<span class="hud-v2-chip-summary ${tone}">${amount}<span class="hud-v2-chip-description">${description}</span></span>`;
    return chip(key.toLowerCase(), label, desktop + summary, resourceSimpleIconUrl(key));
  }).join("");
  const integrity = input.integrityPct === undefined
    ? ""
    : chip("integrity", "Integrity", `<span class="hud-v2-chip-value">${Math.round(input.integrityPct)}%</span>`);
  const gear = `<button type="button" class="hud-v2-gear" data-hud-v2-open="settings" aria-label="Settings" title="Settings · Esc"><span aria-hidden="true">⚙</span><img src="/icons/nav/settings.svg" alt="" draggable="false"></button>`;
  return `${coin}${slots}<span class="hud-v2-sep" aria-hidden="true"></span>${integrity}${gear}`;
};

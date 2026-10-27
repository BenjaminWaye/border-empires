// Top resource bar for the new HUD: Coin with its hourly rate, the four slot
// resources as used / total, Shard and Integrity, plus the settings gear.
// Manpower lives in the orb, not here.

import type { SlotResource } from "@border-empires/shared";

export type ResourceBarInput = {
  gold: number;
  incomePerMinute: number;
  slotSupply: Readonly<Record<SlotResource, number>>;
  slotDemand: Readonly<Record<SlotResource, number>>;
  shard: number;
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

/** Over capacity is the only warning state: full slots are normal. */
export const slotChipState = (used: number, total: number): "normal" | "over" => (used > total ? "over" : "normal");

const chip = (key: string, label: string, valueHtml: string, extraClass = ""): string =>
  `<button type="button" class="hud-v2-chip${extraClass}" data-hud-v2-chip="${key}"><span class="hud-v2-chip-label">${label}</span>${valueHtml}</button>`;

export const resourceBarHtml = (input: ResourceBarInput): string => {
  // Per day, like Economy and the tile panel.
  const ratePerDay = input.incomePerMinute * 1440;
  const rateSign = ratePerDay >= 0 ? "+" : "−";
  const coin = chip(
    "coin",
    "Coin",
    `<span class="hud-v2-chip-value">${fmt(input.gold)}</span><span class="hud-v2-chip-rate">${rateSign}${fmt(Math.abs(ratePerDay))}/day</span>`
  );
  const shown = (key: SlotResource): boolean =>
    key === "FOOD" || !input.isRevealed || input.isRevealed(key) || (input.slotSupply[key] ?? 0) > 0 || (input.slotDemand[key] ?? 0) > 0;
  const slots = SLOT_ORDER.filter(([key]) => shown(key)).map(([key, label]) => {
    const used = Math.max(0, input.slotDemand[key] ?? 0);
    const total = Math.max(0, input.slotSupply[key] ?? 0);
    const over = slotChipState(used, total) === "over";
    const usedHtml = over ? `<b class="hud-v2-over">${fmt(used)}</b>` : `<span class="hud-v2-chip-value">${fmt(used)}</span>`;
    return chip(key.toLowerCase(), label, `${usedHtml}<span class="hud-v2-chip-of">/${fmt(total)}</span>`);
  }).join("");
  // Shards are not a slot resource and have no breakdown, so the chip is a read-out, not a button.
  const shard = `<span class="hud-v2-chip hud-v2-chip-static" title="Shards"><span class="hud-v2-chip-label">Shard</span><span class="hud-v2-chip-value">${fmt(input.shard)}</span></span>`;
  const integrity = input.integrityPct === undefined
    ? ""
    : chip("integrity", "Integrity", `<span class="hud-v2-chip-value">${Math.round(input.integrityPct)}%</span>`);
  const gear = `<button type="button" class="hud-v2-gear" data-hud-v2-open="settings" aria-label="Settings" title="Settings · Esc">⚙</button>`;
  return `${coin}${slots}<span class="hud-v2-sep" aria-hidden="true"></span>${shard}${integrity}${gear}`;
};

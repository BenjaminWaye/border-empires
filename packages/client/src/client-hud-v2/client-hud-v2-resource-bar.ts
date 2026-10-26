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
  const ratePerHour = input.incomePerMinute * 60;
  const rateSign = ratePerHour >= 0 ? "+" : "−";
  const coin = chip(
    "coin",
    "Coin",
    `<span class="hud-v2-chip-value">${fmt(input.gold)}</span><span class="hud-v2-chip-rate">${rateSign}${fmt(Math.abs(ratePerHour))}/h</span>`
  );
  const slots = SLOT_ORDER.map(([key, label]) => {
    const used = Math.max(0, input.slotDemand[key] ?? 0);
    const total = Math.max(0, input.slotSupply[key] ?? 0);
    const over = slotChipState(used, total) === "over";
    const usedHtml = over ? `<b class="hud-v2-over">${fmt(used)}</b>` : `<span class="hud-v2-chip-value">${fmt(used)}</span>`;
    return chip(key.toLowerCase(), label, `${usedHtml}<span class="hud-v2-chip-of">/${fmt(total)}</span>`);
  }).join("");
  const shard = chip("shard", "Shard", `<span class="hud-v2-chip-value">${fmt(input.shard)}</span>`);
  const integrity = input.integrityPct === undefined
    ? ""
    : chip("integrity", "Integrity", `<span class="hud-v2-chip-value">${Math.round(input.integrityPct)}%</span>`);
  const gear = `<button type="button" class="hud-v2-gear" data-hud-v2-open="settings" aria-label="Settings" title="Settings · Esc">⚙</button>`;
  return `${coin}${slots}<span class="hud-v2-sep" aria-hidden="true"></span>${shard}${integrity}${gear}`;
};

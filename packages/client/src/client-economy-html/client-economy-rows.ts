// The new HUD's Economy panel: one row per resource (Coin, Food, Titanium,
// Crystal, Umbrite), each with what you have, where it comes from and what
// uses it. Integrity has its own panel and Shard is not a slot resource, so
// neither is here. The numbers come from the same helpers as the classic
// panel (client-economy-html.ts), which hands them in to avoid an import cycle.

import type { SlotResource } from "@border-empires/shared";
import type { EconomyBucket, EconomyFocusKey } from "../client-economy-model.js";
import type { EconomyPanelArgs } from "./client-economy-html.js";

type RowResource = Exclude<EconomyFocusKey, "ALL">;

const ROWS: readonly RowResource[] = ["GOLD", "FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"];
const MAX_ITEMS = 4;

export type EconomyRowsInput = {
  focus: EconomyFocusKey;
  gold: number;
  /** Coin per minute after upkeep, with where it is earned and spent. */
  coin: { netPerMinute: number; sources: EconomyBucket[]; sinks: EconomyBucket[] };
  slots: Record<SlotResource, { supply: number; demand: number; sources: EconomyBucket[]; occupants: EconomyBucket[] }>;
  isRevealed: (resource: SlotResource) => boolean;
  /** Food coverage 0-1 from the last tick; below 1 some towns go unfed. */
  foodCoverage: number;
  resourceIconHtml: (resource: string) => string;
};

const NAMES: Readonly<Record<RowResource, string>> = { GOLD: "Coin", FOOD: "Food", TITANIUM: "Titanium", CRYSTAL: "Crystal", UMBRITE: "Umbrite" };

const perDay = (perMinute: number): string => `${perMinute >= 0 ? "+" : "−"}${Math.abs(perMinute * 1440).toFixed(1)}/day`;

const named = (b: EconomyBucket): string => `${b.label}${b.count > 1 ? ` ×${b.count}` : ""}`;

const listHtml = (label: string, items: string[], empty: string): string => {
  const shown = items.slice(0, MAX_ITEMS);
  const more = items.length > MAX_ITEMS ? `<span class="v2e-more">+${items.length - MAX_ITEMS} more</span>` : "";
  return `<div class="v2e-list"><span class="v2e-list-h">${label}</span>${shown.length > 0 ? shown.join("") + more : `<span class="v2e-none">${empty}</span>`}</div>`;
};

const item = (text: string, amount: string, warn = false): string =>
  `<span class="v2e-item${warn ? " v2e-warn" : ""}"><span>${text}</span><b>${amount}</b></span>`;

const coinRowHtml = (input: EconomyRowsInput): string => {
  const { coin } = input;
  return `<section class="v2e-row${input.focus === "GOLD" ? " v2e-focus" : ""}" data-v2e-row="GOLD">
    <div class="v2e-head">${input.resourceIconHtml("GOLD")}<span class="v2e-name">Coin</span><b class="v2e-amount">${input.gold.toFixed(1)}</b><span class="v2e-status ${coin.netPerMinute >= 0 ? "v2e-good" : "v2e-bad"}">${perDay(coin.netPerMinute)}</span></div>
    ${listHtml("Earned", coin.sources.map((b) => item(named(b), perDay(b.amountPerMinute))), "No income yet")}
    ${listHtml("Upkeep", coin.sinks.map((b) => item(named(b), perDay(-b.amountPerMinute))), "None")}
  </section>`;
};

const slotStatus = (supply: number, demand: number): { text: string; tone: string } => {
  if (demand > supply) return { text: `Short ${demand - supply}`, tone: "v2e-bad" };
  if (supply === 0) return { text: "None yet", tone: "v2e-muted" };
  if (demand === supply) return { text: "Full", tone: "v2e-warn" };
  return { text: `${supply - demand} free`, tone: "v2e-good" };
};

const slotRowHtml = (input: EconomyRowsInput, resource: SlotResource): string => {
  const focus = input.focus === resource ? " v2e-focus" : "";
  const head = (amount: string, status: string, tone: string): string =>
    `<div class="v2e-head">${input.resourceIconHtml(resource)}<span class="v2e-name">${NAMES[resource]}</span><b class="v2e-amount">${amount}</b><span class="v2e-status ${tone}">${status}</span></div>`;
  if (!input.isRevealed(resource)) {
    return `<section class="v2e-row v2e-locked${focus}" data-v2e-row="${resource}">${head("—", "Not discovered", "v2e-muted")}</section>`;
  }
  const { supply, demand, sources, occupants } = input.slots[resource];
  const status = slotStatus(supply, demand);
  const fed = resource === "FOOD" && input.foodCoverage < 1
    ? `<div class="v2e-note v2e-bad">Towns ${Math.round(input.foodCoverage * 100)}% fed</div>`
    : "";
  return `<section class="v2e-row${demand > supply ? " v2e-short" : ""}${focus}" data-v2e-row="${resource}">
    ${head(`${demand} / ${supply}`, status.text, status.tone)}
    ${listHtml("From", sources.map((b) => item(named(b), `+${b.amountPerMinute}`)), "No tiles yet")}
    ${listHtml("Used by", occupants.map((b) => item(`${named(b)}${b.dormantCount ? ` · ${b.dormantCount} dormant` : ""}`, String(b.amountPerMinute), Boolean(b.dormantCount))), "Nothing yet")}
    ${fed}
  </section>`;
};

export const renderEconomyRowsHtml = (input: EconomyRowsInput): string =>
  `<div class="v2e">${ROWS.map((r) => (r === "GOLD" ? coinRowHtml(input) : slotRowHtml(input, r))).join("")}</div>`;

/** The classic panel's own calculations, handed in by client-economy-html.ts. */
export type EconomyRowsHelpers = {
  slotSources: (args: EconomyPanelArgs, resource: SlotResource) => EconomyBucket[];
  slotOccupants: (args: EconomyPanelArgs, resource: SlotResource) => EconomyBucket[];
  coinDetail: (args: EconomyPanelArgs, resource: "GOLD") => { sources: EconomyBucket[]; sinks: EconomyBucket[] };
};

const SLOT_ROWS: readonly SlotResource[] = ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"];

/** Builds the rows from the classic panel's arguments. */
export const economyRowsFromPanelArgs = (args: EconomyPanelArgs, helpers: EconomyRowsHelpers): string => {
  const coin = helpers.coinDetail(args, "GOLD");
  const slots = Object.fromEntries(SLOT_ROWS.map((r) => [r, {
    supply: args.resourceSlots.supply[r],
    demand: args.resourceSlots.demand[r],
    sources: helpers.slotSources(args, r),
    occupants: helpers.slotOccupants(args, r)
  }])) as EconomyRowsInput["slots"];
  return renderEconomyRowsHtml({
    focus: args.focus,
    gold: args.gold,
    coin: { netPerMinute: args.incomePerMinute - args.upkeepPerMinute.gold, sources: coin.sources, sinks: coin.sinks },
    slots,
    isRevealed: (r) => r === "FOOD" || !args.isRevealed || args.isRevealed(r),
    foodCoverage: args.upkeepLastTick.foodCoverage ?? 1,
    resourceIconHtml: args.resourceIconHtml
  });
};

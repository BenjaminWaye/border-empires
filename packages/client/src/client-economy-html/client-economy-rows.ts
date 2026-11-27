import { slotSupplyAmountLabel } from "./client-economy-slot-sources.js";
import { networkSupplyHtml } from "../client-resource-networks/network-supply-html.js";
// The new HUD's Economy panel: one row per resource (Coin, Food, Titanium,
// Crystal, Umbrite), each with what you have, where it comes from and what
// uses it. Integrity has its own panel, so it is not here. The numbers come from the helpers in
// client-economy-html.ts, which hands them in to avoid an import cycle.

import { formatCoinPerDay, spendableCoin, type CoinIncomeBreakdown, type CoinIncomeBucket, type CoinIncomeLine, type NetworkSupplyStatus, type SlotResource } from "@border-empires/shared";
import type { EconomyBucket, EconomyFocusKey } from "../client-economy-model.js";
import type { EconomyPanelArgs } from "./client-economy-html.js";

type RowResource = Exclude<EconomyFocusKey, "ALL">;

const ROWS: readonly RowResource[] = ["GOLD", "FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"];
const MAX_ITEMS = 4;

export type EconomyRowsInput = {
  focus: EconomyFocusKey;
  bonusSupply?: NetworkSupplyStatus;
  gold: number;
  /** The shared coin breakdown: its earned and upkeep lines sum to its net headline. */
  coin: CoinIncomeBreakdown;
  slots: Record<SlotResource, { supply: number; demand: number; sources: EconomyBucket[]; occupants: EconomyBucket[] }>;
  isRevealed: (resource: SlotResource) => boolean;
  /** Food coverage 0-1 from the last tick; below 1 some towns go unfed. */
  foodCoverage: number;
  resourceIconHtml: (resource: string) => string;
};

const NAMES: Readonly<Record<RowResource, string>> = { GOLD: "Coin", FOOD: "Food", TITANIUM: "Titanium", CRYSTAL: "Crystal", UMBRITE: "Umbrite" };

const perDay = formatCoinPerDay;

const named = (b: Pick<EconomyBucket, "label" | "count">): string => `${b.label}${b.count > 1 ? ` ×${b.count}` : ""}`;

const listHtml = (label: string, items: string[], empty: string, moreHtml = (hidden: number): string => `<span class="v2e-more">+${hidden} more</span>`): string => {
  const shown = items.slice(0, MAX_ITEMS);
  const more = items.length > MAX_ITEMS ? moreHtml(items.length - MAX_ITEMS) : "";
  return `<div class="v2e-list"><span class="v2e-list-h">${label}</span>${shown.length > 0 ? shown.join("") + more : `<span class="v2e-none">${empty}</span>`}</div>`;
};

const item = (text: string, amount: string, warn = false): string =>
  `<span class="v2e-item${warn ? " v2e-warn" : ""}"><span>${text}</span><b>${amount}</b></span>`;

/** Upkeep on the Coin row is mostly coin; a cost paid in another resource names it. */
const upkeepAmount = (b: CoinIncomeBucket): string =>
  b.resourceKey && b.resourceKey !== "GOLD" ? `${perDay(-b.amountPerMinute)} ${NAMES[b.resourceKey as RowResource] ?? b.resourceKey}` : perDay(-b.amountPerMinute);

// Every coin line stays accountable: lines past MAX_ITEMS fold into a "+N more"
// line that carries their total, so the visible amounts always add up to the headline.
const coinListHtml = (label: string, rows: readonly CoinIncomeBucket[], empty: string, amount: (b: CoinIncomeBucket) => string, signed: (perMinute: number) => string): string =>
  listHtml(label, rows.map((b) => item(named(b), amount(b))), empty, (hidden) =>
    item(`+${hidden} more`, signed(rows.slice(MAX_ITEMS).reduce((total, b) => total + b.amountPerMinute, 0))));

// The Integrity line is the one players check against the Integrity panel: it never folds into "+N more".
const pinIntegrityLine = (rows: readonly CoinIncomeLine[]): readonly CoinIncomeLine[] => {
  const index = rows.findIndex((row) => row.kind === "bonus");
  if (rows.length <= MAX_ITEMS || index < MAX_ITEMS - 1) return rows;
  const pinned = rows.filter((_, i) => i !== index);
  pinned.splice(MAX_ITEMS - 1, 0, rows[index]!);
  return pinned;
};

const coinRowHtml = (input: EconomyRowsInput): string => {
  const { coin } = input;
  return `<section class="v2e-row${input.focus === "GOLD" ? " v2e-focus" : ""}" data-v2e-row="GOLD">
    <div class="v2e-head">${input.resourceIconHtml("GOLD")}<span class="v2e-name">Coin</span><b class="v2e-amount">${spendableCoin(input.gold).toLocaleString("en-US")}</b><span class="v2e-status ${coin.netPerMinute >= 0 ? "v2e-good" : "v2e-bad"}">${perDay(coin.netPerMinute)}</span></div>
    ${coinListHtml("Earned", pinIntegrityLine(coin.earned), "No income yet", (b) => perDay(b.amountPerMinute), perDay)}
    ${coinListHtml("Upkeep", coin.upkeep, "None", upkeepAmount, (perMinute) => perDay(-perMinute))}
  </section>`;
};

const slotStatus = (supply: number, demand: number): { text: string; tone: string } => {
  if (demand > supply) return { text: `Short ${demand - supply}`, tone: "v2e-bad" };
  if (supply === 0) return { text: "None yet", tone: "v2e-muted" };
  if (demand === supply) return { text: "Full", tone: "v2e-warn" };
  return { text: `${supply - demand} free`, tone: "v2e-good" };
};

/**
 * With no slots yet, a resource says how to get some and links to the Resources lens: "No tiles yet" alone left a
 * playtester three sessions unable to find titanium (2026-11-14), and for Food it read as false next to a dozen farm
 * tiles still ungarrisoned on the frontier (2026-11-18): only garrisoned grain and fish sites give slots.
 */
const noSourcesHtml = (resource: SlotResource): string =>
  `Garrison a ${resource === "FOOD" ? "grain or fish site" : `${NAMES[resource].toLowerCase()} deposit`} <button type="button" class="v2e-lens" data-economy-lens="${resource}">Find on map</button>`;

const slotRowHtml = (input: EconomyRowsInput, resource: SlotResource): string => {
  const focus = input.focus === resource ? " v2e-focus" : "";
  const head = (amount: string, status: string, tone: string): string =>
    `<div class="v2e-head">${input.resourceIconHtml(resource)}<span class="v2e-name">${NAMES[resource]}</span><b class="v2e-amount">${amount}</b><span class="v2e-status ${tone}">${status}</span></div>`;
  const { supply, demand, sources, occupants } = input.slots[resource];
  const status = slotStatus(supply, demand);
  const fed = resource === "FOOD" && input.foodCoverage < 1
    ? `<div class="v2e-note v2e-bad">Towns ${Math.round(input.foodCoverage * 100)}% fed</div>`
    : "";
  return `<section class="v2e-row${demand > supply ? " v2e-short" : ""}${focus}" data-v2e-row="${resource}">
    ${head(`${demand} / ${supply} used`, status.text, status.tone)}
    ${listHtml("From", sources.map((b) => item(named(b), slotSupplyAmountLabel(b.amountPerMinute))), noSourcesHtml(resource))}
    ${listHtml("Used by", occupants.map((b) => item(`${named(b)}${b.dormantCount ? ` · ${b.dormantCount} dormant` : ""}`, b.amountPerMinute < 0 ? `−${-b.amountPerMinute}` : String(b.amountPerMinute), Boolean(b.dormantCount))), "Nothing yet")}
    ${fed}
  </section>`;
};

// A resource the player has not researched yet gets no row, same as the top bar,
// unless it already has slots or users (e.g. an upgrade grant or a captured
// structure) — hiding those would hide a real shortage.
const showsSlotRow = (input: EconomyRowsInput, r: SlotResource): boolean =>
  input.isRevealed(r) || input.slots[r].supply > 0 || input.slots[r].demand > 0;

export const renderEconomyRowsHtml = (input: EconomyRowsInput): string =>
  `<div class="v2e">${ROWS.map((r) => (r === "GOLD" ? coinRowHtml(input) : showsSlotRow(input, r) ? slotRowHtml(input, r) : "")).join("")}${networkSupplyHtml(input.bonusSupply)}</div>`;

/** The economy calculations, handed in by client-economy-html.ts. */
export type EconomyRowsHelpers = {
  slotSources: (args: EconomyPanelArgs, resource: SlotResource) => EconomyBucket[];
  slotOccupants: (args: EconomyPanelArgs, resource: SlotResource) => EconomyBucket[];
  coinIncome: (args: EconomyPanelArgs) => CoinIncomeBreakdown;
};

const SLOT_ROWS: readonly SlotResource[] = ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE"];

/** Builds the rows from the Economy panel arguments. */
export const economyRowsFromPanelArgs = (args: EconomyPanelArgs, helpers: EconomyRowsHelpers): string => {
  const slots = Object.fromEntries(SLOT_ROWS.map((r) => [r, {
    supply: args.resourceSlots.supply[r],
    demand: args.resourceSlots.demand[r],
    sources: helpers.slotSources(args, r),
    occupants: helpers.slotOccupants(args, r)
  }])) as EconomyRowsInput["slots"];
  return renderEconomyRowsHtml({
    focus: args.focus,
    ...(args.resourceSlots.bonusSupply ? { bonusSupply: args.resourceSlots.bonusSupply } : {}),
    gold: args.gold,
    coin: helpers.coinIncome(args),
    slots,
    isRevealed: (r) => !args.isRevealed || args.isRevealed(r),
    foodCoverage: args.upkeepLastTick.foodCoverage ?? 1,
    resourceIconHtml: args.resourceIconHtml
  });
};

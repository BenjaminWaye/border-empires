// "Next step" rows in the tracker. Owner call 2026-11-20: the tutorial teaches the game, so this is not a
// second, never-ending tutorial listing every option. It shows only no-brainer fixes while something runs
// low (FOOD is its own section, client-hud-v2-food-shortage.ts), each pointing at a tile whose menu acts:
//   - manpower low: take a neutral town, gamble on a waystation, ship salvage; with none in sight, explore;
//   - coin low: build a Manufactory (an instant +MANUFACTORY_INSTANT_GOLD_BONUS Coin on completion).
// Nothing low: no rows, whether or not the development slots are busy.

import { SALVAGE_LOADS_PER_SITE, WAYSTATION_MANPOWER_GRANT, formatCoinPerDay, spendableCoin, structureCostDefinition } from "@border-empires/shared";
import { MANUFACTORY_INSTANT_GOLD_BONUS } from "@border-empires/game-domain";
import type { ClientState } from "../client-state/client-state.js";
import { empireCoinIncome } from "../client-coin-income/client-coin-income.js";
import { relayBeaconManpowerCostForState } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import { manifestNodeState } from "./client-hud-v2-manifest.js";
import { structureManpowerCostForState } from "../client-structure-manpower-cost/client-structure-manpower-cost.js";
import { scanNextStepSources, type NextStepSite, type NextStepSources } from "./client-hud-v2-next-step-sources.js";
import { foodShortBy, scanFoodSources, type FoodScan } from "./client-hud-v2-food-shortage.js";

/** Manpower counts as low below this share of the cap, or below the next beacon's price. */
export const LOW_MANPOWER_SHARE = 0.25;
/**
 * Coin counts as low when the next Manifest is further away than this, or coin income isn't positive.
 * Being a little short is the normal state (every player is saving for the next Manifest), so that alone
 * isn't "low"; a wait longer than one daily visit is.
 */
export const LOW_COIN_WAIT_MS = 12 * 3_600_000;
/** At most this many rows, so the tracker never pushes Flags and queued expansions out of view. */
export const NEXT_STEP_CAP = 5;

export type NextStepInput = {
  manpower: number;
  manpowerCap: number;
  /** Manpower for the player's next Relay Beacon (relayBeaconManpowerCostForState): below it, manpower is low. */
  beaconCost: number;
  gold: number;
  /** Net coin per minute (internal unit; shown per day). */
  netPerMinute: number;
  /** Price of the next Manifest, or undefined when none is left to commission. */
  nextManifestCost: number | undefined;
  /** Where more manpower or coin can come from (scanNextStepSources); omitted rows are skipped. */
  sources?: NextStepSources;
  /** Manpower a Manufactory charges this player. */
  manufactoryCost?: number;
};

export type NextStep = {
  title: string;
  sub: string;
  /** A HUD target (data-hud-v2-open), a resource chip (data-hud-v2-chip), or Relay Beacon placement (data-hud-v2-beacon). */
  open?: { kind: "open" | "chip" | "beacon"; key: string };
  /** Centre and select this tile; its own tile menu has the action. */
  focus?: { x: number; y: number };
  hint?: string;
};

/** Ms until `gold` reaches `cost` at the net rate, 0 when already there, undefined when income is not positive. */
export const msUntilCoin = (gold: number, cost: number, netPerMinute: number): number | undefined => {
  const short = cost - spendableCoin(gold);
  if (short <= 0) return 0;
  if (!(netPerMinute > 0)) return undefined;
  return Math.ceil(short / netPerMinute) * 60_000;
};

/**
 * "Need 30 more Coin · +24.0/day", or the no-income state. Undefined when affordable. No "ready in" time:
 * Coin arrives in batches, so the estimate sat still for hours ("ready in 34h 18m" ten minutes apart,
 * Playtest Run 4), and spending or new income moves it anyway; the gap and the rate say the same.
 */
export const coinShortText = (gold: number, cost: number, netPerMinute: number): string | undefined => {
  const short = cost - spendableCoin(gold);
  if (short <= 0) return undefined;
  const need = `Need ${short.toLocaleString("en-US")} more Coin · ${formatCoinPerDay(netPerMinute)}`;
  return netPerMinute > 0 ? need : `${need} · feed a town for Coin`;
};

export const isManpowerLow = (input: Pick<NextStepInput, "manpower" | "manpowerCap" | "beaconCost">): boolean =>
  input.manpower < Math.ceil(input.beaconCost) || input.manpower < input.manpowerCap * LOW_MANPOWER_SHARE;

export const isCoinLow = (input: Pick<NextStepInput, "gold" | "nextManifestCost" | "netPerMinute">): boolean => {
  if (input.nextManifestCost === undefined) return false;
  const eta = msUntilCoin(input.gold, input.nextManifestCost, input.netPerMinute);
  return eta === undefined || eta > LOW_COIN_WAIT_MS;
};

const place = (site: NextStepSite): string => site.name ?? `${site.x}, ${site.y}`;
const at = (site: NextStepSite): { x: number; y: number } => ({ x: site.x, y: site.y });
const mp = (n: number): string => n.toLocaleString("en-US");
const WAYSTATION_ODDS = `1 in 6 chance of +${mp(WAYSTATION_MANPOWER_GRANT)} MP`;

/** Nearest first in the order a player should reach for them: a town is sure, a waystation is a gamble. */
const manpowerSourceSteps = (sources: NextStepSources): NextStep[] => {
  const steps: NextStep[] = [];
  const { salvage, waystation, neutralTown, explore } = sources;
  if (neutralTown) {
    steps.push({ title: "Take a neutral town", sub: `${place(neutralTown)} · +${mp(neutralTown.capAdded)} MP once settled · +${mp(neutralTown.perBatch)} per batch`, focus: at(neutralTown) });
  }
  if (waystation) {
    steps.push(waystation.owned
      ? { title: "Activate a waystation", sub: WAYSTATION_ODDS, focus: at(waystation) }
      : { title: "Claim a waystation", sub: `Expand To it, then Activate · ${WAYSTATION_ODDS}`, focus: at(waystation) });
  }
  if (salvage) steps.push({ title: "Ship salvage to the Court", sub: `+${mp(salvage.delivered)} MP · ${salvage.loads} of ${SALVAGE_LOADS_PER_SITE} loads left`, focus: at(salvage) });
  if (steps.length === 0 && explore) steps.push({ title: "Explore", sub: "Find a town, waystation or salvage · scout drone", focus: at(explore) });
  return steps;
};

const manufactoryStep = (input: NextStepInput): NextStep | undefined => {
  const town = input.sources?.manufactoryTown;
  if (!town) return undefined;
  const cost = input.manufactoryCost === undefined ? "" : `${Math.ceil(input.manufactoryCost)} MP · `;
  return { title: "Build a Manufactory", sub: `${cost}+${MANUFACTORY_INSTANT_GOLD_BONUS} Coin when built · ${place(town)}`, focus: at(town) };
};

/** No-brainer fixes for whatever is low; nothing when nothing is. */
export const nextSteps = (input: NextStepInput): NextStep[] => {
  const steps: Array<NextStep | undefined> = [];
  if (isManpowerLow(input) && input.sources) steps.push(...manpowerSourceSteps(input.sources));
  if (isCoinLow(input)) steps.push(manufactoryStep(input));
  return steps.filter((step): step is NextStep => step !== undefined).slice(0, NEXT_STEP_CAP);
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `lead` is HTML placed first under the head: the "Short N FOOD" section (client-hud-v2-food-shortage.ts). */
export const nextStepsHtml = (steps: readonly NextStep[], lead = ""): string => {
  if (steps.length === 0 && !lead) return "";
  const rows = steps.map((s) => {
    const attr = s.focus ? ` data-hud-v2-focus-x="${s.focus.x}" data-hud-v2-focus-y="${s.focus.y}"` : !s.open ? "" : s.open.kind === "open" ? ` data-hud-v2-open="${esc(s.open.key)}"` : s.open.kind === "chip" ? ` data-hud-v2-chip="${esc(s.open.key)}"` : ` data-hud-v2-beacon="${esc(s.open.key)}"`;
    const title = s.hint ? ` title="${esc(s.hint)}"` : "";
    const tag = s.open || s.focus ? "button" : "div";
    const type = s.open || s.focus ? ` type="button"` : "";
    return `<${tag}${type} class="hud-v2-tracker-row hud-v2-next-step"${attr}${title}><span class="hud-v2-tracker-title">${esc(s.title)}</span><span class="hud-v2-tracker-sub">${esc(s.sub)}</span></${tag}>`;
  }).join("");
  return `<div class="hud-v2-tracker-head"><span>Next step</span></div>${lead}${rows}`;
};


/**
 * The tile-scanning inputs, computed with the tracker's cached scan (client-hud-v2.ts) instead of per render.
 * `food` is scanned only while FOOD is short; the scan refreshes within seconds once it is.
 */
export type NextStepScan = { sources: NextStepSources; beaconCost: number; food?: FoodScan };

export const nextStepScanForState = (state: ClientState): NextStepScan => ({
  sources: scanNextStepSources(state),
  beaconCost: relayBeaconManpowerCostForState(state),
  ...(foodShortBy(state) > 0 ? { food: scanFoodSources(state) } : {})
});

/** Next steps from client state; `scan` defaults to a fresh scan. */
export const nextStepsForState = (state: ClientState, scan: NextStepScan = nextStepScanForState(state)): NextStep[] => {
  const owned = new Set(state.techIds);
  const choices = new Set(state.techChoices);
  // Every Manifest shares one price, but only count it while one can be commissioned (not all locked).
  const canCommission = state.techCatalog.some((t) => manifestNodeState(t, owned, choices) === "available");
  const nextManifestCost = canCommission ? state.techCatalog.find((t) => !owned.has(t.id))?.requirements.gold : undefined;
  const netPerMinute = empireCoinIncome(state).netPerMinute;
  const levels = { manpower: state.manpower, manpowerCap: state.manpowerCap, beaconCost: scan.beaconCost, gold: state.gold, nextManifestCost, netPerMinute };
  if (!isManpowerLow(levels) && !isCoinLow(levels)) return [];
  return nextSteps({
    ...levels,
    sources: scan.sources,
    ...(scan.sources.manufactoryTown ? { manufactoryCost: structureManpowerCostForState(state, "MANUFACTORY", structureCostDefinition("MANUFACTORY").manpowerCost ?? 0) } : {})
  });
};

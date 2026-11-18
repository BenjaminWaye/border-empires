// "Next step" rows for the tracker when the development slots sit idle (playtest 2026-11-18: two testers
// ran out of coin, saw nothing to build and quit at 9 and 12 minutes). Guidance only, no rule changes:
// manpower is what builds (a Relay Beacon is the main growth verb), coin only buys Manifests and upgrades,
// so the rows say what manpower can do now and when coin reaches the next Manifest, in coin per day.
// When manpower or coin runs low (owner feedback 2026-11-18) the rows also name where more comes from --
// a salvage shipment, a waystation, a neutral town, a Manufactory -- even while the slots are busy.

import { SALVAGE_LOADS_PER_SITE, WAYSTATION_MANPOWER_GRANT, formatCoinPerDay, spendableCoin, structureCostDefinition } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { empireCoinIncome } from "../client-coin-income/client-coin-income.js";
import { formatDuration } from "../client-duke-panel/client-duke-format.js";
import { formatRefillCountdown, nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";
import { hasFreeResourceSlotsForRelayBeacon } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";
import { hasRelayBeaconBuildTile } from "../client-relay-beacon-site/client-relay-beacon-site.js";
import { relayBeaconManpowerCostForState } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import { REACH_HINT } from "./client-hud-v2-hints.js";
import { manifestNodeState } from "./client-hud-v2-manifest.js";
import { structureManpowerCostForState } from "../client-structure-manpower-cost/client-structure-manpower-cost.js";
import { scanNextStepSources, type NextStepSite, type NextStepSources } from "./client-hud-v2-next-step-sources.js";

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
  devBusy: number;
  queued: number;
  manpower: number;
  manpowerCap: number;
  /** Manpower for the player's next Relay Beacon (relayBeaconManpowerCostForState). */
  beaconCost: number;
  /**
   * A beacon can be built now: some tile passes the build path's rule (isRelayBeaconBuildTile) and a FOOD
   * slot is free when the beacon needs one. False drops the beacon row rather than suggest a build that fails.
   */
  beaconBuildable: boolean;
  /** Ms until the next manpower batch, or undefined when unknown. */
  nextBatchInMs: number | undefined;
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

/** "45m", "30h", then "5d 18h" past two days (long coin waits read badly in hours). */
export const formatEta = (ms: number): string => (ms < 48 * 3_600_000 ? formatRefillCountdown(ms) : formatDuration(ms));

/** Ms until `gold` reaches `cost` at the net rate, 0 when already there, undefined when income is not positive. */
export const msUntilCoin = (gold: number, cost: number, netPerMinute: number): number | undefined => {
  const short = cost - spendableCoin(gold);
  if (short <= 0) return 0;
  if (!(netPerMinute > 0)) return undefined;
  return Math.ceil(short / netPerMinute) * 60_000;
};

/** "Need 30 more · +24.0/day · ready in 1h 15m", or the no-income state. Undefined when affordable. */
export const coinShortText = (gold: number, cost: number, netPerMinute: number): string | undefined => {
  const short = cost - spendableCoin(gold);
  if (short <= 0) return undefined;
  const eta = msUntilCoin(gold, cost, netPerMinute);
  const rate = formatCoinPerDay(netPerMinute);
  return eta === undefined
    ? `Need ${short.toLocaleString("en-US")} more Coin · ${rate} · feed a town for Coin`
    : `Need ${short.toLocaleString("en-US")} more Coin · ${rate} · ready in ${formatEta(eta)}`;
};

const manpowerStep = (input: NextStepInput): NextStep | undefined => {
  if (!input.beaconBuildable) return undefined;
  const cost = Math.max(0, Math.ceil(input.beaconCost));
  if (input.manpower >= cost) {
    return { title: "Build a Relay Beacon", sub: `${cost} MP · garrisoned land · more land to build on`, hint: REACH_HINT, open: { kind: "beacon", key: "RELAY_BEACON" } };
  }
  const batch = input.nextBatchInMs === undefined ? "" : ` · next batch ${formatEta(input.nextBatchInMs)}`;
  return { title: "Saving MP", sub: `Relay Beacon ${cost} MP${batch}`, open: { kind: "open", key: "manpower" } };
};

const coinStep = (input: NextStepInput): NextStep | undefined => {
  const cost = input.nextManifestCost;
  if (cost === undefined) return undefined;
  const title = `Next Manifest ${cost.toLocaleString("en-US")} Coin`;
  if (spendableCoin(input.gold) >= cost) return { title: "Manifest affordable", sub: `${cost.toLocaleString("en-US")} Coin · commission one`, open: { kind: "open", key: "manifest" } };
  const eta = msUntilCoin(input.gold, cost, input.netPerMinute);
  if (eta === undefined) return { title, sub: `${formatCoinPerDay(input.netPerMinute)} · feed a town for Coin`, open: { kind: "chip", key: "coin" } };
  return { title, sub: `${formatCoinPerDay(input.netPerMinute)} · ready in ${formatEta(eta)}`, open: { kind: "open", key: "manifest" } };
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
const WAYSTATION_ODDS = `1 in 6 chance of +${WAYSTATION_MANPOWER_GRANT.toLocaleString("en-US")} MP`;

const manpowerSourceSteps = (sources: NextStepSources): NextStep[] => {
  const steps: NextStep[] = [];
  const { salvage, waystation, neutralTown } = sources;
  if (salvage) steps.push({ title: "Ship salvage to the Court", sub: `+${salvage.delivered.toLocaleString("en-US")} MP · ${salvage.loads} of ${SALVAGE_LOADS_PER_SITE} loads left`, focus: at(salvage) });
  if (waystation) {
    steps.push(waystation.owned
      ? { title: "Activate a waystation", sub: WAYSTATION_ODDS, focus: at(waystation) }
      : { title: "Claim a waystation", sub: `Expand To it, then Activate · ${WAYSTATION_ODDS}`, focus: at(waystation) });
  }
  if (neutralTown) steps.push({ title: "Take a neutral town", sub: `${place(neutralTown)} · more manpower every batch`, focus: at(neutralTown) });
  return steps;
};

const manufactoryStep = (input: NextStepInput): NextStep | undefined => {
  const town = input.sources?.manufactoryTown;
  if (!town) return undefined;
  const cost = input.manufactoryCost === undefined ? "" : `${Math.ceil(input.manufactoryCost)} MP · `;
  return { title: "Build a Manufactory", sub: `${cost}more Coin from ${place(town)}`, focus: at(town) };
};

/**
 * Next steps. With the slots idle: what manpower can do and when coin reaches the next Manifest. Whenever
 * manpower or coin is low, busy slots or not: where more of it comes from.
 */
export const nextSteps = (input: NextStepInput): NextStep[] => {
  const idle = input.devBusy <= 0 && input.queued <= 0;
  const mpLow = isManpowerLow(input);
  const coinLow = isCoinLow(input);
  const steps: Array<NextStep | undefined> = [];
  // No buildable beacon: the coin row is the next most useful step.
  if (idle) steps.push(manpowerStep(input));
  if (mpLow && input.sources) steps.push(...manpowerSourceSteps(input.sources));
  if (idle || coinLow) steps.push(coinStep(input));
  if (coinLow) steps.push(manufactoryStep(input));
  return steps.filter((step): step is NextStep => step !== undefined).slice(0, NEXT_STEP_CAP);
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const nextStepsHtml = (steps: readonly NextStep[]): string => {
  if (steps.length === 0) return "";
  const rows = steps.map((s) => {
    const attr = s.focus ? ` data-hud-v2-focus-x="${s.focus.x}" data-hud-v2-focus-y="${s.focus.y}"` : !s.open ? "" : s.open.kind === "open" ? ` data-hud-v2-open="${esc(s.open.key)}"` : s.open.kind === "chip" ? ` data-hud-v2-chip="${esc(s.open.key)}"` : ` data-hud-v2-beacon="${esc(s.open.key)}"`;
    const title = s.hint ? ` title="${esc(s.hint)}"` : "";
    const tag = s.open || s.focus ? "button" : "div";
    const type = s.open || s.focus ? ` type="button"` : "";
    return `<${tag}${type} class="hud-v2-tracker-row hud-v2-next-step"${attr}${title}><span class="hud-v2-tracker-title">${esc(s.title)}</span><span class="hud-v2-tracker-sub">${esc(s.sub)}</span></${tag}>`;
  }).join("");
  return `<div class="hud-v2-tracker-head"><span>Next step</span></div>${rows}`;
};


/** The tile-scanning inputs, computed with the tracker's cached scan (client-hud-v2.ts) instead of per render. */
export type NextStepScan = { sources: NextStepSources; beaconCost: number };

export const nextStepScanForState = (state: ClientState): NextStepScan =>
  ({ sources: scanNextStepSources(state), beaconCost: relayBeaconManpowerCostForState(state) });

/** Next steps from client state; `scan` defaults to a fresh scan. */
export const nextStepsForState = (state: ClientState, slots: { busy: number; queued: number }, nowMs: number, scan: NextStepScan = nextStepScanForState(state)): NextStep[] => {
  const idle = slots.busy <= 0 && slots.queued <= 0;
  const owned = new Set(state.techIds);
  const choices = new Set(state.techChoices);
  // Every Manifest shares one price, but only offer it while one can be commissioned (not all locked).
  const canCommission = state.techCatalog.some((t) => manifestNodeState(t, owned, choices) === "available");
  const nextManifestCost = canCommission ? state.techCatalog.find((t) => !owned.has(t.id))?.requirements.gold : undefined;
  const netPerMinute = empireCoinIncome(state).netPerMinute;
  const levels = { manpower: state.manpower, manpowerCap: state.manpowerCap, beaconCost: scan.beaconCost, gold: state.gold, nextManifestCost, netPerMinute };
  // Busy and nothing low: no rows, so skip the beacon site check.
  if (!idle && !isManpowerLow(levels) && !isCoinLow(levels)) return [];
  const refillAt = nextManpowerRefillForPlayer(state.me, nowMs);
  return nextSteps({
    ...levels,
    devBusy: slots.busy,
    queued: slots.queued,
    beaconBuildable: idle && hasFreeResourceSlotsForRelayBeacon(state) && hasRelayBeaconBuildTile(state.tiles, state.me),
    nextBatchInMs: refillAt === undefined ? undefined : refillAt - nowMs,
    sources: scan.sources,
    ...(scan.sources.manufactoryTown ? { manufactoryCost: structureManpowerCostForState(state, "MANUFACTORY", structureCostDefinition("MANUFACTORY").manpowerCost ?? 0) } : {})
  });
};

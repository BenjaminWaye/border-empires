// "Next step" rows for the tracker when the development slots sit idle (playtest 2026-11-18: two testers
// ran out of coin, saw nothing to build and quit at 9 and 12 minutes). Guidance only, no rule changes:
// manpower is what builds (a Relay Beacon is the main growth verb), coin only buys Manifests and upgrades,
// so the rows say what manpower can do now and when coin reaches the next Manifest, in coin per day.

import { formatCoinPerDay, spendableCoin } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import { empireCoinIncome } from "../client-coin-income/client-coin-income.js";
import { formatRefillCountdown, nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";
import { hasFreeResourceSlotsForRelayBeacon } from "../client-relay-beacon-food-slot/client-relay-beacon-food-slot.js";
import { hasRelayBeaconBuildTile } from "../client-relay-beacon-site/client-relay-beacon-site.js";
import { relayBeaconManpowerCostForState } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import { REACH_HINT } from "./client-hud-v2-hints.js";

export type NextStepInput = {
  devBusy: number;
  queued: number;
  manpower: number;
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
};

export type NextStep = {
  title: string;
  sub: string;
  /** A HUD target (data-hud-v2-open) or a resource chip (data-hud-v2-chip) the row opens. */
  open?: { kind: "open" | "chip"; key: string };
  hint?: string;
};

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
    ? `Need ${short.toLocaleString("en-US")} more · ${rate} · feed a town for coin`
    : `Need ${short.toLocaleString("en-US")} more · ${rate} · ready in ${formatRefillCountdown(eta)}`;
};

const manpowerStep = (input: NextStepInput): NextStep | undefined => {
  if (!input.beaconBuildable) return undefined;
  const cost = Math.max(0, Math.ceil(input.beaconCost));
  if (input.manpower >= cost) {
    return { title: "Build a Relay Beacon", sub: `${cost} MP · on garrisoned land · grows reach`, hint: REACH_HINT };
  }
  const batch = input.nextBatchInMs === undefined ? "" : ` · next batch ${formatRefillCountdown(input.nextBatchInMs)}`;
  return { title: "Saving manpower", sub: `Relay Beacon ${cost} MP${batch}`, open: { kind: "open", key: "manpower" } };
};

const coinStep = (input: NextStepInput): NextStep | undefined => {
  const cost = input.nextManifestCost;
  if (cost === undefined) return undefined;
  const title = `Next Manifest ${cost.toLocaleString("en-US")} Coin`;
  if (spendableCoin(input.gold) >= cost) return { title: "Manifest affordable", sub: `${cost.toLocaleString("en-US")} Coin · commission one`, open: { kind: "open", key: "manifest" } };
  const eta = msUntilCoin(input.gold, cost, input.netPerMinute);
  if (eta === undefined) return { title, sub: `${formatCoinPerDay(input.netPerMinute)} · feed a town for coin`, open: { kind: "chip", key: "coin" } };
  return { title, sub: `${formatCoinPerDay(input.netPerMinute)} · ready in ${formatRefillCountdown(eta)}`, open: { kind: "open", key: "manifest" } };
};

/** Next steps while nothing is building or queued; empty while the slots are busy. */
export const nextSteps = (input: NextStepInput): NextStep[] => {
  if (input.devBusy > 0 || input.queued > 0) return [];
  // No buildable beacon: the coin row is the next most useful step.
  return [manpowerStep(input), coinStep(input)].filter((step): step is NextStep => step !== undefined);
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const nextStepsHtml = (steps: readonly NextStep[]): string => {
  if (steps.length === 0) return "";
  const rows = steps.map((s) => {
    const attr = s.open ? (s.open.kind === "open" ? ` data-hud-v2-open="${esc(s.open.key)}"` : ` data-hud-v2-chip="${esc(s.open.key)}"`) : "";
    const title = s.hint ? ` title="${esc(s.hint)}"` : "";
    const tag = s.open ? "button" : "div";
    const type = s.open ? ` type="button"` : "";
    return `<${tag}${type} class="hud-v2-tracker-row hud-v2-next-step"${attr}${title}><span class="hud-v2-tracker-title">${esc(s.title)}</span><span class="hud-v2-tracker-sub">${esc(s.sub)}</span></${tag}>`;
  }).join("");
  return `<div class="hud-v2-tracker-head"><span>Next step</span></div>${rows}`;
};


/**
 * Next steps from client state. The beacon price scans owned tiles, so it is only priced while the slots
 * are idle (the only time the rows show).
 */
export const nextStepsForState = (state: ClientState, slots: { busy: number; queued: number }, nowMs: number): NextStep[] => {
  if (slots.busy > 0 || slots.queued > 0) return [];
  const refillAt = nextManpowerRefillForPlayer(state.me, nowMs);
  return nextSteps({
    devBusy: slots.busy,
    queued: slots.queued,
    manpower: state.manpower,
    beaconCost: relayBeaconManpowerCostForState(state),
    beaconBuildable: hasFreeResourceSlotsForRelayBeacon(state) && hasRelayBeaconBuildTile(state.tiles, state.me),
    nextBatchInMs: refillAt === undefined ? undefined : refillAt - nowMs,
    gold: state.gold,
    netPerMinute: empireCoinIncome(state).netPerMinute,
    nextManifestCost: state.techCatalog.find((t) => !state.techIds.includes(t.id))?.requirements.gold
  });
};

// Production for the Duke layer (§21.8): a daily *rate* feeding one build
// slot, not a wallet. Pure logic; the service supplies the rate and applies
// the returned effects.
import { initialCourtOffer, presentCourtOffer } from "../galaxy-court-offer/galaxy-court-offer.js";
import { MS_PER_DAY, dailyProductionRate } from "../galaxy-production-queue/galaxy-production-queue.js";
import type { GalaxySpecialization } from "@border-empires/sim-protocol";
import {
  CYCLE_DAYS,
  FIGHTER_COST,
  FORTIFY_COST_PER_POINT,
  HULL_MAX,
  IDLE_BANK_CYCLES,
  INCURSION_WARNING_MS,
  MAX_FIGHTERS,
  MAX_PROBE_STOCK,
  PROBE_COST,
  refitCost
} from "./galaxy-duke-config.js";
import { pushDigest } from "./galaxy-duke-digest.js";
import type { DukeBuild, DukeCounter, DukeState } from "./galaxy-duke-types.js";

export type DukeEffect =
  | { kind: "STABILITY_DELTA"; seasonId: string; delta: number }
  | { kind: "INFLUENCE_DELTA"; delta: number };

export type DukeStep = { state: DukeState; counters: DukeCounter[]; effects: DukeEffect[] };

export type HeldSector = { seasonId: string; tier: "PLANET" | "OUTPOST"; specialization: GalaxySpecialization };

export const totalDailyProduction = (holdings: ReadonlyArray<HeldSector>): number =>
  holdings.reduce((sum, h) => sum + dailyProductionRate(h.specialization, h.tier), 0);

// First contact (§21.10): a new Duke immediately gets the scripted incursion
// warning (3 days) and the Court's one-time offer.
export const createDukeState = (authUid: string, now: number, cycleIndex = 0): DukeState => {
  const base: DukeState = {
    authUid,
    createdAt: now,
    lastAdvancedAt: now,
    slot: null,
    idleBank: 0,
    fighters: [],
    probeStock: 0,
    orbiting: [],
    intel: [],
    inFlight: null,
    actionGate: { lastGatedActionAt: null },
    courtOffer: presentCourtOffer(initialCourtOffer),
    incursion: { credit: 0, arrivesAt: now + INCURSION_WARNING_MS, count: 0, lastCreditCycle: cycleIndex },
    digest: []
  };
  return pushDigest(
    base,
    now,
    "COMBAT",
    "Unidentified craft detected on approach. Arrival in 3 days. Build a Fighter to defend, or your Sector will take a hit."
  ).state;
};

const cycleBankCap = (ratePerDay: number): number => ratePerDay * CYCLE_DAYS * IDLE_BANK_CYCLES;

// Advances the slot (or the idle bank) by the time since the last advance.
export const advanceProduction = (
  state: DukeState,
  ratePerDay: number,
  now: number
): { state: DukeState; completed: DukeBuild | null } => {
  const elapsed = Math.max(0, now - state.lastAdvancedAt);
  const stamped = { ...state, lastAdvancedAt: now };
  if (ratePerDay <= 0 || elapsed === 0) return { state: stamped, completed: null };
  const perMs = ratePerDay / MS_PER_DAY;
  if (!state.slot) {
    const idleBank = Math.min(cycleBankCap(ratePerDay), state.idleBank + elapsed * perMs);
    return { state: { ...stamped, idleBank }, completed: null };
  }
  const needed = state.slot.cost - state.slot.progress;
  const msNeeded = needed / perMs;
  if (elapsed >= msNeeded) {
    const leftover = (elapsed - msNeeded) * perMs;
    return {
      state: { ...stamped, slot: null, idleBank: Math.min(cycleBankCap(ratePerDay), state.idleBank + leftover) },
      completed: { ...state.slot, progress: state.slot.cost }
    };
  }
  return { state: { ...stamped, slot: { ...state.slot, progress: state.slot.progress + elapsed * perMs } }, completed: null };
};

export type BuildSpec =
  | { kind: "FIGHTER" }
  | { kind: "PROBE" }
  | { kind: "FORTIFY"; seasonId: string; points: number }
  | { kind: "REFIT" };

export type PlanBuildResult =
  | { ok: true; build: Omit<DukeBuild, "progress"> }
  | { ok: false; code: "SLOT_BUSY" | "FIGHTER_CAP" | "PROBE_STOCK_CAP" | "NOTHING_TO_REPAIR" | "NOT_OWNED" | "INVALID" };

// Validates and prices a build. `stabilityOf` returns the current Stability of
// a Sector the Duke holds, or undefined if they do not hold it.
export const planBuild = (
  state: DukeState,
  spec: BuildSpec,
  stabilityOf: (seasonId: string) => number | undefined
): PlanBuildResult => {
  if (state.slot) return { ok: false, code: "SLOT_BUSY" };
  if (spec.kind === "FIGHTER") {
    const owned = state.fighters.length + (state.inFlight?.kind === "RAID" ? 1 : 0);
    if (owned >= MAX_FIGHTERS) return { ok: false, code: "FIGHTER_CAP" };
    return { ok: true, build: { kind: "FIGHTER", label: "Fighter", cost: FIGHTER_COST } };
  }
  if (spec.kind === "PROBE") {
    if (state.probeStock >= MAX_PROBE_STOCK) return { ok: false, code: "PROBE_STOCK_CAP" };
    return { ok: true, build: { kind: "PROBE", label: "Probe", cost: PROBE_COST } };
  }
  if (spec.kind === "FORTIFY") {
    const stability = stabilityOf(spec.seasonId);
    if (stability === undefined) return { ok: false, code: "NOT_OWNED" };
    const missing = HULL_MAX - stability;
    const points = Math.floor(spec.points);
    if (!Number.isFinite(points) || points < 1 || points > missing) return { ok: false, code: "INVALID" };
    return { ok: true, build: { kind: "FORTIFY", label: `Fortify +${points}`, cost: points * FORTIFY_COST_PER_POINT, seasonId: spec.seasonId, points } };
  }
  const weakest = state.fighters.reduce<number | null>((min, f) => (min === null || f.hull < min ? f.hull : min), null);
  if (weakest === null || weakest >= HULL_MAX) return { ok: false, code: "NOTHING_TO_REPAIR" };
  return { ok: true, build: { kind: "REFIT", label: "Refit", cost: refitCost(HULL_MAX - weakest) } };
};

// Starts a planned build. Banked Production from an idle slot carries into
// the new build (capped at its cost) so an empty slot only wastes what
// exceeds one Cycle.
export const startPlannedBuild = (state: DukeState, planned: Omit<DukeBuild, "progress">): DukeState => {
  const carried = Math.min(planned.cost, state.idleBank);
  return { ...state, slot: { ...planned, progress: carried }, idleBank: state.idleBank - carried };
};

export const cancelBuild = (state: DukeState): DukeState => ({ ...state, slot: null });

// Applies a finished build's effect (§26.2).
export const applyCompletedBuild = (state: DukeState, build: DukeBuild, now: number): DukeStep => {
  const counters: DukeCounter[] = [];
  const effects: DukeEffect[] = [];
  let next = state;
  let text = "";
  if (build.kind === "FIGHTER") {
    next = { ...next, fighters: [...next.fighters, { hull: HULL_MAX }] };
    text = "Fighter complete. It now defends your Sector.";
  } else if (build.kind === "PROBE") {
    next = { ...next, probeStock: Math.min(MAX_PROBE_STOCK, next.probeStock + 1) };
    text = "Probe complete and ready to launch.";
  } else if (build.kind === "REFIT") {
    const idx = next.fighters.reduce((best, f, i) => (best === -1 || f.hull < next.fighters[best]!.hull ? i : best), -1);
    if (idx >= 0) next = { ...next, fighters: next.fighters.map((f, i) => (i === idx ? { hull: HULL_MAX } : f)) };
    text = "Refit complete. Fighter hull restored to 100%.";
  } else if (build.seasonId !== undefined && build.points !== undefined) {
    effects.push({ kind: "STABILITY_DELTA", seasonId: build.seasonId, delta: build.points });
    text = `Fortify complete. Stability +${build.points}.`;
  }
  const pushed = pushDigest(next, now, "ECONOMY", text);
  return { state: pushed.state, counters: [...counters, ...pushed.counters], effects };
};

// Per-system Production (§21.8, §26): each Planet has its own daily rate feeding
// its own one build slot. Pure logic; the service supplies stability and applies
// the returned effects.
import { MS_PER_DAY } from "../galaxy-production-queue/galaxy-production-queue.js";
import {
  CYCLE_DAYS,
  DEVELOPMENTS,
  DEVELOPMENT_FOR_BODY,
  FIGHTER_COST,
  FORTIFY_COST_PER_POINT,
  HULL_MAX,
  IDLE_BANK_CYCLES,
  MAX_FIGHTERS_PER_SYSTEM,
  MAX_PROBES_PER_SYSTEM,
  PROBE_COST,
  refitCost
} from "./galaxy-duke-config.js";
import { pushDigest } from "./galaxy-duke-digest.js";
import { findSystem, replaceSystem, systemBodyKinds, systemDailyRate } from "./galaxy-duke-systems.js";
import type { DukeBuild, DukeCounter, DukeState, SystemState } from "./galaxy-duke-types.js";

export type DukeEffect =
  | { kind: "STABILITY_DELTA"; seasonId: string; delta: number }
  | { kind: "INFLUENCE_DELTA"; delta: number };

export type DukeStep = { state: DukeState; counters: DukeCounter[]; effects: DukeEffect[] };

const cycleBankCap = (ratePerDay: number): number => ratePerDay * CYCLE_DAYS * IDLE_BANK_CYCLES;

// Advances one system's slot (or idle bank) by `elapsedMs`.
export const advanceSystem = (system: SystemState, elapsedMs: number): { system: SystemState; completed: DukeBuild | null } => {
  const ratePerDay = systemDailyRate(system);
  if (ratePerDay <= 0 || elapsedMs <= 0) return { system, completed: null };
  const perMs = ratePerDay / MS_PER_DAY;
  if (!system.slot) {
    return { system: { ...system, idleBank: Math.min(cycleBankCap(ratePerDay), system.idleBank + elapsedMs * perMs) }, completed: null };
  }
  const msNeeded = (system.slot.cost - system.slot.progress) / perMs;
  if (elapsedMs >= msNeeded) {
    const leftover = (elapsedMs - msNeeded) * perMs;
    return {
      system: { ...system, slot: null, idleBank: Math.min(cycleBankCap(ratePerDay), system.idleBank + leftover) },
      completed: { ...system.slot, progress: system.slot.cost }
    };
  }
  return { system: { ...system, slot: { ...system.slot, progress: system.slot.progress + elapsedMs * perMs } }, completed: null };
};

export type BuildSpec =
  | { kind: "FIGHTER" }
  | { kind: "PROBE" }
  | { kind: "REFIT" }
  | { kind: "FORTIFY"; points: number }
  | { kind: "DEVELOP"; bodyIndex: number };

export type PlanBuildErrorCode =
  | "NO_SUCH_SYSTEM"
  | "SLOT_BUSY"
  | "FIGHTER_CAP"
  | "PROBE_STOCK_CAP"
  | "NOTHING_TO_REPAIR"
  | "INVALID"
  | "NO_SUCH_BODY"
  | "BODY_ALREADY_DEVELOPED";
export type PlanBuildResult = { ok: true; build: Omit<DukeBuild, "progress"> } | { ok: false; code: PlanBuildErrorCode };

// Fighters currently away on a raid still count toward the cap.
const fightersOwned = (state: DukeState, system: SystemState): number =>
  system.fighters.length + state.flights.filter((f) => f.kind === "RAID" && f.fromSeasonId === system.seasonId).length;

export const planBuild = (state: DukeState, seasonId: string, spec: BuildSpec, stability: number): PlanBuildResult => {
  const system = findSystem(state, seasonId);
  if (!system) return { ok: false, code: "NO_SUCH_SYSTEM" };
  if (system.slot) return { ok: false, code: "SLOT_BUSY" };
  switch (spec.kind) {
    case "FIGHTER":
      return fightersOwned(state, system) >= MAX_FIGHTERS_PER_SYSTEM
        ? { ok: false, code: "FIGHTER_CAP" }
        : { ok: true, build: { kind: "FIGHTER", label: "Fighter", cost: FIGHTER_COST } };
    case "PROBE":
      return system.probeStock >= MAX_PROBES_PER_SYSTEM
        ? { ok: false, code: "PROBE_STOCK_CAP" }
        : { ok: true, build: { kind: "PROBE", label: "Probe", cost: PROBE_COST } };
    case "REFIT": {
      const weakest = system.fighters.reduce<number | null>((min, f) => (min === null || f.hull < min ? f.hull : min), null);
      return weakest === null || weakest >= HULL_MAX
        ? { ok: false, code: "NOTHING_TO_REPAIR" }
        : { ok: true, build: { kind: "REFIT", label: "Refit", cost: refitCost(HULL_MAX - weakest) } };
    }
    case "FORTIFY": {
      const points = Math.floor(spec.points);
      if (!Number.isFinite(points) || points < 1 || points > HULL_MAX - stability) return { ok: false, code: "INVALID" };
      return { ok: true, build: { kind: "FORTIFY", label: `Fortify +${points}`, cost: points * FORTIFY_COST_PER_POINT, points } };
    }
    case "DEVELOP": {
      const bodies = systemBodyKinds(seasonId);
      const body = bodies[spec.bodyIndex];
      if (!Number.isInteger(spec.bodyIndex) || body === undefined) return { ok: false, code: "NO_SUCH_BODY" };
      if (system.developments.some((d) => d.bodyIndex === spec.bodyIndex)) return { ok: false, code: "BODY_ALREADY_DEVELOPED" };
      const dev = DEVELOPMENTS[DEVELOPMENT_FOR_BODY[body]];
      return { ok: true, build: { kind: "DEVELOP", label: dev.label, cost: dev.cost, bodyIndex: spec.bodyIndex, development: dev.kind } };
    }
  }
};

// Banked Production from an idle slot carries into the new build (capped at its
// cost), so an empty slot only wastes what exceeds one Cycle.
export const startPlannedBuild = (state: DukeState, seasonId: string, planned: Omit<DukeBuild, "progress">): DukeState => {
  const system = findSystem(state, seasonId);
  if (!system) return state;
  const carried = Math.min(planned.cost, system.idleBank);
  return replaceSystem(state, { ...system, slot: { ...planned, progress: carried }, idleBank: system.idleBank - carried });
};

export const cancelBuild = (state: DukeState, seasonId: string): DukeState => {
  const system = findSystem(state, seasonId);
  return system ? replaceSystem(state, { ...system, slot: null }) : state;
};

// Applies a finished build's effect and writes the digest line (§26.2).
export const applyCompletedBuild = (state: DukeState, seasonId: string, build: DukeBuild, now: number): DukeStep => {
  const system = findSystem(state, seasonId);
  if (!system) return { state, counters: [], effects: [] };
  const effects: DukeEffect[] = [];
  let next: SystemState = system;
  let text = "";
  if (build.kind === "FIGHTER") {
    next = { ...next, fighters: [...next.fighters, { hull: HULL_MAX }] };
    text = "Fighter complete. It now defends this system.";
  } else if (build.kind === "PROBE") {
    next = { ...next, probeStock: Math.min(MAX_PROBES_PER_SYSTEM, next.probeStock + 1) };
    text = "Probe complete and ready to launch.";
  } else if (build.kind === "REFIT") {
    const idx = next.fighters.reduce((best, f, i) => (best === -1 || f.hull < next.fighters[best]!.hull ? i : best), -1);
    if (idx >= 0) next = { ...next, fighters: next.fighters.map((f, i) => (i === idx ? { hull: HULL_MAX } : f)) };
    text = "Refit complete. Fighter hull restored to 100%.";
  } else if (build.kind === "FORTIFY" && build.points !== undefined) {
    effects.push({ kind: "STABILITY_DELTA", seasonId, delta: build.points });
    text = `Fortify complete. Stability +${build.points}.`;
  } else if (build.kind === "DEVELOP" && build.bodyIndex !== undefined && build.development) {
    next = { ...next, developments: [...next.developments, { bodyIndex: build.bodyIndex, kind: build.development }] };
    text = `${DEVELOPMENTS[build.development].label} online: ${DEVELOPMENTS[build.development].summary}.`;
  }
  const pushed = pushDigest(replaceSystem(state, next), now, "ECONOMY", text);
  return { state: pushed.state, counters: pushed.counters, effects };
};

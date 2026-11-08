// Per-system builds (§26, §30). Starting a build is a system's order for the
// day; it finishes on a fixed timer of at most a day, faster where the system's
// Production is higher. Pure logic; the service supplies stability and applies
// the returned effects.
import { HULL_MAX, MAX_FIGHTERS_PER_SYSTEM, MAX_PROBES_PER_SYSTEM, DEVELOPMENTS, DEVELOPMENT_FOR_BODY, buildDurationMs } from "./galaxy-duke-config.js";
import { pushDigest } from "./galaxy-duke-digest.js";
import { findSystem, replaceSystem, systemBodyKinds, systemDailyRate } from "./galaxy-duke-systems.js";
import type { DukeBuild, DukeCounter, DukeState, SystemState } from "./galaxy-duke-types.js";

export type DukeEffect =
  | { kind: "STABILITY_DELTA"; seasonId: string; delta: number }
  | { kind: "INFLUENCE_DELTA"; delta: number };

export type DukeStep = { state: DukeState; counters: DukeCounter[]; effects: DukeEffect[] };

// Finishes the system's build once its timer is up.
export const advanceSystem = (system: SystemState, now: number): { system: SystemState; completed: DukeBuild | null } => {
  if (!system.slot || now < system.slot.completesAt) return { system, completed: null };
  return { system: { ...system, slot: null }, completed: system.slot };
};

export type BuildSpec = { kind: "FIGHTER" } | { kind: "PROBE" } | { kind: "REFIT" } | { kind: "BASE"; bodyIndex: number } | { kind: "DEVELOP"; bodyIndex: number };

export type PlanBuildErrorCode =
  | "NO_SUCH_SYSTEM"
  | "SLOT_BUSY"
  | "FIGHTER_CAP"
  | "PROBE_STOCK_CAP"
  | "NOTHING_TO_REPAIR"
  | "INVALID"
  | "NO_SUCH_BODY"
  | "BODY_ALREADY_DEVELOPED"
  | "NO_BASE"
  | "BASE_ALREADY_THERE";

export type PlannedBuild = Omit<DukeBuild, "startedAt" | "completesAt"> & { durationMs: number };
export type PlanBuildResult = { ok: true; build: PlannedBuild } | { ok: false; code: PlanBuildErrorCode };

// Fighters away on a raid or lent to the Court still count toward the cap; a
// Court Fighter on a Writ strike is the Court's, not this system's.
export const fightersOwned = (state: DukeState, system: SystemState): number =>
  system.fighters.length +
  state.flights.filter((f) => f.kind === "RAID" && !f.courtWrit && f.fromSeasonId === system.seasonId).length +
  (state.lent ?? []).filter((l) => l.fromSeasonId === system.seasonId).length;

// A body has a base once one is established on it, or once it is developed.
export const hasBase = (system: SystemState, bodyIndex: number): boolean =>
  (system.bases ?? []).includes(bodyIndex) || system.developments.some((d) => d.bodyIndex === bodyIndex);

export const planBuild = (state: DukeState, seasonId: string, spec: BuildSpec): PlanBuildResult => {
  const system = findSystem(state, seasonId);
  if (!system) return { ok: false, code: "NO_SUCH_SYSTEM" };
  if (system.slot) return { ok: false, code: "SLOT_BUSY" };
  const rate = systemDailyRate(system);
  switch (spec.kind) {
    case "FIGHTER":
      return fightersOwned(state, system) >= MAX_FIGHTERS_PER_SYSTEM
        ? { ok: false, code: "FIGHTER_CAP" }
        : { ok: true, build: { kind: "FIGHTER", label: "Fighter", durationMs: buildDurationMs("FIGHTER", rate) } };
    case "PROBE":
      return system.probeStock >= MAX_PROBES_PER_SYSTEM
        ? { ok: false, code: "PROBE_STOCK_CAP" }
        : { ok: true, build: { kind: "PROBE", label: "Probe", durationMs: buildDurationMs("PROBE", rate) } };
    case "REFIT":
      return system.fighters.every((f) => f.hull >= HULL_MAX)
        ? { ok: false, code: "NOTHING_TO_REPAIR" }
        : { ok: true, build: { kind: "REFIT", label: "Refit", durationMs: buildDurationMs("REFIT", rate) } };
    case "BASE": {
      const body = systemBodyKinds(seasonId)[spec.bodyIndex];
      if (!Number.isInteger(spec.bodyIndex) || body === undefined) return { ok: false, code: "NO_SUCH_BODY" };
      if (hasBase(system, spec.bodyIndex)) return { ok: false, code: "BASE_ALREADY_THERE" };
      return { ok: true, build: { kind: "BASE", label: "Base", bodyIndex: spec.bodyIndex, durationMs: buildDurationMs("BASE", rate) } };
    }
    case "DEVELOP": {
      const body = systemBodyKinds(seasonId)[spec.bodyIndex];
      if (!Number.isInteger(spec.bodyIndex) || body === undefined) return { ok: false, code: "NO_SUCH_BODY" };
      if (system.developments.some((d) => d.bodyIndex === spec.bodyIndex)) return { ok: false, code: "BODY_ALREADY_DEVELOPED" };
      if (!hasBase(system, spec.bodyIndex)) return { ok: false, code: "NO_BASE" };
      const dev = DEVELOPMENTS[DEVELOPMENT_FOR_BODY[body]];
      return { ok: true, build: { kind: "DEVELOP", label: dev.label, bodyIndex: spec.bodyIndex, development: dev.kind, durationMs: buildDurationMs("DEVELOP", rate) } };
    }
  }
};

export const startPlannedBuild = (state: DukeState, seasonId: string, planned: PlannedBuild, now: number): DukeState => {
  const system = findSystem(state, seasonId);
  if (!system) return state;
  const { durationMs, ...rest } = planned;
  return replaceSystem(state, { ...system, slot: { ...rest, startedAt: now, completesAt: now + durationMs } });
};

export const cancelBuild = (state: DukeState, seasonId: string): DukeState => {
  const system = findSystem(state, seasonId);
  return system ? replaceSystem(state, { ...system, slot: null }) : state;
};

// Applies a finished build's effect and writes the digest line (§26.2).
export const applyCompletedBuild = (state: DukeState, seasonId: string, build: DukeBuild, now: number): DukeStep => {
  const system = findSystem(state, seasonId);
  if (!system) return { state, counters: [], effects: [] };
  let next: SystemState = system;
  let text = "";
  if (build.kind === "FIGHTER") {
    next = { ...next, fighters: [...next.fighters, { hull: HULL_MAX }] };
    text = "Fighter complete. It now defends this system.";
  } else if (build.kind === "PROBE") {
    next = { ...next, probeStock: Math.min(MAX_PROBES_PER_SYSTEM, next.probeStock + 1) };
    text = "Probe complete and ready to launch.";
  } else if (build.kind === "REFIT") {
    next = { ...next, fighters: next.fighters.map(() => ({ hull: HULL_MAX })) };
    text = "Refit complete. Every Fighter here is back to 100%.";
  } else if (build.kind === "BASE" && build.bodyIndex !== undefined) {
    next = { ...next, bases: [...(next.bases ?? []).filter((b) => b !== build.bodyIndex), build.bodyIndex] };
    text = "Base established. That body can now be developed.";
  } else if (build.kind === "DEVELOP" && build.bodyIndex !== undefined && build.development) {
    next = { ...next, developments: [...next.developments, { bodyIndex: build.bodyIndex, kind: build.development }] };
    text = `${DEVELOPMENTS[build.development].label} online: ${DEVELOPMENTS[build.development].summary}.`;
  }
  const pushed = pushDigest(replaceSystem(state, next), now, "ECONOMY", text);
  return { state: pushed.state, counters: pushed.counters, effects: [] };
};

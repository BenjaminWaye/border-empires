// One system's read model: its menu of builds (with the reason when one is
// unavailable), its bodies and what is built on them, and its ships.
import type { GalaxyBodyKind } from "@border-empires/shared";

import { hitsRemaining } from "../galaxy-duke-engine/galaxy-duke-combat.js";
import { DEVELOPMENTS, DEVELOPMENT_FOR_BODY, FIGHTER_COST, PROBE_COST, refitCost, HULL_MAX } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { planBuild, type BuildSpec, type PlanBuildErrorCode } from "../galaxy-duke-engine/galaxy-duke-production.js";
import { systemBodyKinds, systemDailyRate } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeState, SystemState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { daysToComplete } from "../galaxy-production-queue/galaxy-production-queue.js";

export type BuildOptionView = {
  kind: "FIGHTER" | "PROBE" | "REFIT" | "DEVELOP";
  label: string;
  summary: string;
  cost: number;
  daysAtCurrentRate: number | null;
  // Null when it can be started now; otherwise why not.
  blockedBy: PlanBuildErrorCode | null;
};

export type BodyView = {
  index: number;
  kind: GalaxyBodyKind;
  development: { label: string; summary: string } | null;
  option: BuildOptionView | null;
};

export type SystemView = {
  seasonId: string;
  label: string;
  specialization: string;
  stability: number;
  hitsRemaining: number;
  ratePerDay: number;
  slot: { kind: string; label: string; cost: number; progress: number; daysLeft: number | null } | null;
  idleBank: number;
  fighters: number[];
  probeStock: number;
  options: BuildOptionView[];
  // Fortify is a slider on the client: the most points that can be restored.
  fortifyMaxPoints: number;
  fortifyBlockedBy: PlanBuildErrorCode | null;
  bodies: BodyView[];
  incursionArrivesAt: number | null;
  developmentsOnline: number;
  freeDevelopmentUsed: boolean;
};

const days = (cost: number, rate: number): number | null => (rate > 0 ? daysToComplete(cost, rate) : null);

const option = (
  state: DukeState,
  seasonId: string,
  rate: number,
  stability: number,
  spec: BuildSpec,
  kind: BuildOptionView["kind"],
  label: string,
  summary: string,
  cost: number
): BuildOptionView => {
  const plan = planBuild(state, seasonId, spec, stability);
  return { kind, label, summary, cost, daysAtCurrentRate: days(cost, rate), blockedBy: plan.ok ? null : plan.code };
};

export const buildSystemView = (state: DukeState, system: SystemState, label: string, stability: number): SystemView => {
  const rate = systemDailyRate(system);
  const weakest = system.fighters.reduce<number>((min, f) => Math.min(min, f.hull), HULL_MAX);
  const bodies = systemBodyKinds(system.seasonId).map((kind, index): BodyView => {
    const built = system.developments.find((d) => d.bodyIndex === index);
    if (built) return { index, kind, development: { label: DEVELOPMENTS[built.kind].label, summary: DEVELOPMENTS[built.kind].summary }, option: null };
    const dev = DEVELOPMENTS[DEVELOPMENT_FOR_BODY[kind]];
    return { index, kind, development: null, option: option(state, system.seasonId, rate, stability, { kind: "DEVELOP", bodyIndex: index }, "DEVELOP", dev.label, dev.summary, dev.cost) };
  });
  const fortify = planBuild(state, system.seasonId, { kind: "FORTIFY", points: 1 }, stability);
  return {
    seasonId: system.seasonId,
    label,
    specialization: system.specialization,
    stability,
    hitsRemaining: hitsRemaining(stability),
    ratePerDay: Math.round(rate * 100) / 100,
    slot: system.slot
      ? { kind: system.slot.kind, label: system.slot.label, cost: system.slot.cost, progress: Math.round(system.slot.progress * 10) / 10, daysLeft: days(system.slot.cost - system.slot.progress, rate) }
      : null,
    idleBank: Math.round(system.idleBank * 10) / 10,
    fighters: system.fighters.map((f) => f.hull),
    probeStock: system.probeStock,
    options: [
      option(state, system.seasonId, rate, stability, { kind: "FIGHTER" }, "FIGHTER", "Fighter", "Defends this system, and can raid", FIGHTER_COST),
      option(state, system.seasonId, rate, stability, { kind: "PROBE" }, "PROBE", "Probe", "Surveys a system, then watches it", PROBE_COST),
      option(state, system.seasonId, rate, stability, { kind: "REFIT" }, "REFIT", "Refit", "Repairs your most damaged Fighter", system.fighters.length ? refitCost(HULL_MAX - weakest) : refitCost(0))
    ],
    fortifyMaxPoints: Math.max(0, HULL_MAX - stability),
    fortifyBlockedBy: fortify.ok ? null : fortify.code,
    bodies,
    incursionArrivesAt: system.incursion.arrivesAt,
    developmentsOnline: system.developments.length,
    freeDevelopmentUsed: system.developments.length >= 1
  };
};

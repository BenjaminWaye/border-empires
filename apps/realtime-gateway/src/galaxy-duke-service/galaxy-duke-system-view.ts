// One system's read model: its order for the day (§30), its menu of builds
// (with how long each takes and the reason when one is unavailable), its bodies
// and what is built on them, and its ships.
import type { GalaxyBodyKind } from "@border-empires/shared";

import { hitsRemaining } from "../galaxy-duke-engine/galaxy-duke-combat.js";
import { DEVELOPMENTS, DEVELOPMENT_FOR_BODY, FORTIFY_STABILITY } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { isOrderReady, orderReadyAt } from "../galaxy-duke-engine/galaxy-duke-daily.js";
import { hasBase, planBuild, type BuildSpec, type PlanBuildErrorCode } from "../galaxy-duke-engine/galaxy-duke-production.js";
import { systemBodyKinds, systemDailyRate } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeState, SystemState } from "../galaxy-duke-engine/galaxy-duke-types.js";

export type BuildOptionView = {
  kind: "FIGHTER" | "PROBE" | "REFIT" | "BASE" | "DEVELOP";
  label: string;
  summary: string;
  // How long the build takes in this system, in milliseconds (at most a day).
  durationMs: number;
  // Null when it can be started now; otherwise why not.
  blockedBy: PlanBuildErrorCode | null;
};

export type BodyView = {
  index: number;
  kind: GalaxyBodyKind;
  development: { label: string; summary: string } | null;
  // A base must be established before the body can be developed (§31).
  base: boolean;
  baseOption: BuildOptionView | null;
  option: BuildOptionView | null;
};

export type SystemView = {
  seasonId: string;
  label: string;
  specialization: string;
  stability: number;
  hitsRemaining: number;
  // Production: how fast this system builds.
  ratePerDay: number;
  // The system's one order a day: ready now, or when it is ready again.
  order: { ready: boolean; readyAt: number | null };
  slot: { kind: string; label: string; startedAt: number; completesAt: number; bodyIndex: number | null } | null;
  // When a raid or Warden last got through here, or null.
  lastHitAt: number | null;
  fighters: number[];
  probeStock: number;
  options: BuildOptionView[];
  fortify: { stability: number; blockedBy: "ALREADY_STABLE" | null };
  bodies: BodyView[];
  incursionArrivesAt: number | null;
  developmentsOnline: number;
  freeDevelopmentUsed: boolean;
};

const option = (state: DukeState, seasonId: string, spec: BuildSpec, label: string, summary: string): BuildOptionView => {
  const plan = planBuild(state, seasonId, spec);
  return {
    kind: spec.kind,
    label,
    summary,
    durationMs: plan.ok ? plan.build.durationMs : 0,
    blockedBy: plan.ok ? null : plan.code
  };
};

export const buildSystemView = (state: DukeState, system: SystemState, label: string, stability: number, now: number): SystemView => {
  const bodies = systemBodyKinds(system.seasonId).map((kind, index): BodyView => {
    const built = system.developments.find((d) => d.bodyIndex === index);
    if (built) return { index, kind, development: { label: DEVELOPMENTS[built.kind].label, summary: DEVELOPMENTS[built.kind].summary }, base: true, baseOption: null, option: null };
    const dev = DEVELOPMENTS[DEVELOPMENT_FOR_BODY[kind]];
    const based = hasBase(system, index);
    return {
      index,
      kind,
      development: null,
      base: based,
      baseOption: based ? null : option(state, system.seasonId, { kind: "BASE", bodyIndex: index }, "Establish base", `Lets you build a ${dev.label} here`),
      option: option(state, system.seasonId, { kind: "DEVELOP", bodyIndex: index }, dev.label, dev.summary)
    };
  });
  const ready = isOrderReady(state, system.seasonId, now);
  return {
    seasonId: system.seasonId,
    label,
    specialization: system.specialization,
    stability,
    hitsRemaining: hitsRemaining(stability),
    ratePerDay: Math.round(systemDailyRate(system) * 100) / 100,
    order: { ready, readyAt: ready ? null : orderReadyAt(state, system.seasonId) },
    slot: system.slot
      ? { kind: system.slot.kind, label: system.slot.label, startedAt: system.slot.startedAt, completesAt: system.slot.completesAt, bodyIndex: system.slot.bodyIndex ?? null }
      : null,
    lastHitAt: system.lastHitAt ?? null,
    fighters: system.fighters.map((f) => f.hull),
    probeStock: system.probeStock,
    options: [
      option(state, system.seasonId, { kind: "FIGHTER" }, "Fighter", "Blocks raids and Wardens here, and can raid"),
      option(state, system.seasonId, { kind: "PROBE" }, "Probe", "Scouts a rival, then keeps watching it"),
      option(state, system.seasonId, { kind: "REFIT" }, "Refit", "Repairs every Fighter here")
    ],
    fortify: { stability: FORTIFY_STABILITY, blockedBy: stability >= 100 ? "ALREADY_STABLE" : null },
    bodies,
    incursionArrivesAt: system.incursion.arrivesAt,
    developmentsOnline: system.developments.length,
    freeDevelopmentUsed: system.developments.length >= 1
  };
};

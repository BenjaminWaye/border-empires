// The Duke tick: advances one Duke's world state (per-system production,
// arrivals, incursions, Cycle effects, orbit intel) under that Duke's lock.
// Called by the scheduler for every Duke, and by the action routes so a player
// never acts on stale state.
import { currentGlobalCycleIndex } from "../galaxy-senate-tick/galaxy-senate-tick.js";
import { healthiestFighterIndex } from "../galaxy-duke-engine/galaxy-duke-combat.js";
import { applyCycleEffects } from "../galaxy-duke-engine/galaxy-duke-cycle.js";
import { pushDigest } from "../galaxy-duke-engine/galaxy-duke-digest.js";
import { accrueIncursions, landIncursions, type SectorView } from "../galaxy-duke-engine/galaxy-duke-incursion.js";
import { arriveProbe, arrivedFlights, dropFlight, refreshOrbitIntel, resolveRaidArrival, type TargetView } from "../galaxy-duke-engine/galaxy-duke-orders.js";
import { advanceSystem, applyCompletedBuild, type DukeEffect } from "../galaxy-duke-engine/galaxy-duke-production.js";
import { createDukeState, findSystem, planetsOf, replaceSystem, syncSystems } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeCounter, DukeState, InFlightOrder } from "../galaxy-duke-engine/galaxy-duke-types.js";
import type { DukeContext, DukeWorld } from "./galaxy-duke-context.js";

const defenderHullOf = (state: DukeState | undefined, seasonId: string): number | null => {
  const system = state ? findSystem(state, seasonId) : undefined;
  if (!system) return null;
  const idx = healthiestFighterIndex(system.fighters);
  return idx === -1 ? null : system.fighters[idx]!.hull;
};

export const viewTarget = async (ctx: DukeContext, world: DukeWorld, seasonId: string): Promise<TargetView | undefined> => {
  const owner = world.ownerOfSeason.get(seasonId);
  const tier = world.tierOfSeason.get(seasonId);
  if (!owner || !tier) return undefined;
  const stability = await ctx.deps.galaxyEconomyStore.ensureStability({ authUid: owner, seasonId, tier });
  return {
    seasonId,
    label: await ctx.labelFor(seasonId),
    stability: stability.stability,
    defenderHull: defenderHullOf(await ctx.deps.dukeStore.get(owner), seasonId)
  };
};

export const heldSectors = async (ctx: DukeContext, world: DukeWorld, authUid: string): Promise<Map<string, SectorView>> => {
  const out = new Map<string, SectorView>();
  for (const h of planetsOf(world.holdingsByOwner.get(authUid) ?? [])) {
    const record = await ctx.deps.galaxyEconomyStore.ensureStability({ authUid, seasonId: h.seasonId, tier: h.tier });
    out.set(h.seasonId, { label: await ctx.labelFor(h.seasonId), stability: record.stability });
  }
  return out;
};

type Acc = { effects: DukeEffect[]; counters: DukeCounter[] };

const resolveProbe = async (ctx: DukeContext, world: DukeWorld, state: DukeState, flight: InFlightOrder, acc: Acc): Promise<DukeState> => {
  const view = await viewTarget(ctx, world, flight.seasonId);
  if (!view) return pushDigest(dropFlight(state, flight), ctx.now(), "INTEL", "Probe lost contact before it arrived.").state;
  const step = arriveProbe(state, flight, view, ctx.now());
  acc.effects.push(...step.effects);
  acc.counters.push(...step.counters);
  // Reuse the existing fog-of-war set so the strategic map shows the system as
  // Surveyed. `garrison` carries the defender's hull % now that Garrison is gone.
  await ctx.deps.galaxyExplorationStore?.recordSurvey({
    authUid: state.authUid,
    seasonId: view.seasonId,
    stability: view.stability,
    garrison: view.defenderHull ?? 0,
    surveyedAt: ctx.now()
  });
  return step.state;
};

const resolveRaid = async (ctx: DukeContext, world: DukeWorld, state: DukeState, flight: InFlightOrder, acc: Acc): Promise<DukeState> => {
  const at = ctx.now();
  const owner = world.ownerOfSeason.get(flight.seasonId);
  const tier = world.tierOfSeason.get(flight.seasonId);
  if (flight.kind !== "RAID" || !owner || !tier || owner === state.authUid) {
    // Target vanished (transferred/lost): the Fighter simply returns home.
    const home = flight.kind === "RAID" ? findSystem(state, flight.fromSeasonId) : undefined;
    const back = home && flight.kind === "RAID" ? replaceSystem(dropFlight(state, flight), { ...home, fighters: [...home.fighters, { hull: flight.fighterHull }] }) : dropFlight(state, flight);
    return pushDigest(back, at, "COMBAT", "Your Fighter found nothing to raid and returned.").state;
  }
  const label = await ctx.labelFor(flight.seasonId);
  // Already inside the one Duke lock, so the defender's state can be read and
  // written here without taking another.
  const defender = (await ctx.deps.dukeStore.get(owner)) ?? null;
  const stability = await ctx.deps.galaxyEconomyStore.ensureStability({ authUid: owner, seasonId: flight.seasonId, tier });
  const step = resolveRaidArrival(state, defender, flight, { seasonId: flight.seasonId, label, stability: stability.stability }, at);
  acc.counters.push(...step.counters);
  const effects: DukeEffect[] = step.targetStabilityDelta === 0 ? [] : [{ kind: "STABILITY_DELTA", seasonId: flight.seasonId, delta: step.targetStabilityDelta }];
  const contested = await ctx.applyEffects(owner, effects, world);
  if (step.defender) await ctx.deps.dukeStore.put(await ctx.noteContested(step.defender, contested, at));
  await ctx.deps.galaxyBattleLogStore.recordRaid({
    attackerAuthUid: state.authUid,
    defenderAuthUid: owner,
    targetSeasonId: flight.seasonId,
    reconOnly: false,
    damageDealt: step.targetStabilityDelta === 0 ? 0 : -step.targetStabilityDelta,
    netDamage: -step.targetStabilityDelta,
    stabilityAfter: Math.max(0, stability.stability + step.targetStabilityDelta),
    resolvedAt: at
  });
  return step.attacker;
};

// Advances one Duke to `now`. Returns undefined when the account holds no Planet.
export const advanceOneDuke = async (ctx: DukeContext, world: DukeWorld, authUid: string): Promise<DukeState | undefined> => {
  const planets = planetsOf(world.holdingsByOwner.get(authUid) ?? []);
  if (planets.length === 0) return undefined;
  const cycleIndex = currentGlobalCycleIndex(ctx.now());
  return ctx.withLock(async () => {
    const at = ctx.now();
    // A row written by an older build (no per-system state) is treated as a new Duke.
    const stored = await ctx.deps.dukeStore.get(authUid);
    let state = syncSystems(stored && Array.isArray(stored.systems) ? stored : createDukeState(authUid, planets, at, cycleIndex), planets, at);
    const acc: Acc = { effects: [], counters: [] };

    const labels = new Map<string, string>();
    for (const system of state.systems) labels.set(system.seasonId, await ctx.labelFor(system.seasonId));

    // Production, per system.
    const elapsed = Math.max(0, at - state.lastAdvancedAt);
    for (const system of [...state.systems]) {
      const advanced = advanceSystem(system, elapsed);
      state = replaceSystem(state, advanced.system);
      if (advanced.completed) {
        const done = applyCompletedBuild(state, system.seasonId, advanced.completed, at);
        state = done.state;
        acc.effects.push(...done.effects);
        acc.counters.push(...done.counters);
      }
    }
    state = { ...state, lastAdvancedAt: at };

    // Orders that have arrived.
    for (const flight of arrivedFlights(state, at)) {
      state = flight.kind === "PROBE" ? await resolveProbe(ctx, world, state, flight, acc) : await resolveRaid(ctx, world, state, flight, acc);
    }

    // Wardens: accrue credit, announce, and land what is due.
    const accrued = accrueIncursions(state, world.capturedSectors, labels, at);
    state = accrued.state;
    acc.counters.push(...accrued.counters);
    const landed = landIncursions(state, await heldSectors(ctx, world, authUid), at);
    state = landed.state;
    acc.effects.push(...landed.effects);
    acc.counters.push(...landed.counters);

    // Development upkeep and Cryo healing, once per Cycle.
    const cycle = applyCycleEffects(state, cycleIndex, labels, at);
    state = cycle.state;
    acc.effects.push(...cycle.effects);
    acc.counters.push(...cycle.counters);

    const contested = await ctx.applyEffects(authUid, acc.effects, world);
    state = await ctx.noteContested(state, contested, at);

    const views = new Map<string, TargetView>();
    for (const orbit of state.orbiting) {
      const view = await viewTarget(ctx, world, orbit.seasonId);
      if (view) views.set(orbit.seasonId, view);
    }
    const refreshed = refreshOrbitIntel(state, (id) => views.get(id), at);
    state = refreshed.state;
    acc.counters.push(...refreshed.counters);

    ctx.countAll(acc.counters);
    await ctx.deps.dukeStore.put(state);
    return state;
  });
};

export const runDukeTick = async (ctx: DukeContext): Promise<void> => {
  const world = await ctx.loadWorld();
  for (const authUid of world.dukeUids) {
    try {
      await advanceOneDuke(ctx, world, authUid);
    } catch (error) {
      ctx.deps.onError?.(error);
    }
  }
};

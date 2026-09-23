// The Duke tick: advances one Duke's world state (production, arrivals,
// incursions, orbit intel) under that Duke's lock. Called by the scheduler for
// every Duke, and by the action routes so a player never acts on stale state.
import { currentGlobalCycleIndex } from "../galaxy-senate-tick/galaxy-senate-tick.js";
import { healthiestFighterIndex } from "../galaxy-duke-engine/galaxy-duke-combat.js";
import { pushDigest } from "../galaxy-duke-engine/galaxy-duke-digest.js";
import { creditIncursion, landIncursion, type HeldStability } from "../galaxy-duke-engine/galaxy-duke-incursion.js";
import { arriveProbe, refreshOrbitIntel, resolveRaidArrival, type TargetView } from "../galaxy-duke-engine/galaxy-duke-orders.js";
import {
  advanceProduction,
  applyCompletedBuild,
  createDukeState,
  totalDailyProduction,
  type DukeEffect
} from "../galaxy-duke-engine/galaxy-duke-production.js";
import type { DukeCounter, DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import type { DukeContext, DukeWorld } from "./galaxy-duke-context.js";

const defenderHullOf = (state: DukeState | undefined): number | null => {
  if (!state) return null;
  const idx = healthiestFighterIndex(state.fighters);
  return idx === -1 ? null : state.fighters[idx]!.hull;
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
    defenderHull: defenderHullOf(await ctx.deps.dukeStore.get(owner))
  };
};

export const heldStabilities = async (ctx: DukeContext, world: DukeWorld, authUid: string): Promise<HeldStability[]> => {
  const out: HeldStability[] = [];
  for (const h of world.holdingsByOwner.get(authUid) ?? []) {
    const record = await ctx.deps.galaxyEconomyStore.ensureStability({ authUid, seasonId: h.seasonId, tier: h.tier });
    out.push({ seasonId: h.seasonId, label: await ctx.labelFor(h.seasonId), stability: record.stability });
  }
  return out;
};

type Acc = { effects: DukeEffect[]; counters: DukeCounter[] };

const resolveProbe = async (ctx: DukeContext, world: DukeWorld, state: DukeState, acc: Acc): Promise<DukeState> => {
  const flight = state.inFlight;
  if (!flight || flight.kind !== "PROBE") return state;
  const view = await viewTarget(ctx, world, flight.seasonId);
  if (!view) {
    return pushDigest({ ...state, inFlight: null }, ctx.now(), "INTEL", "Probe lost contact before it arrived.").state;
  }
  const step = arriveProbe(state, view, ctx.now());
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

const resolveRaid = async (ctx: DukeContext, world: DukeWorld, state: DukeState, acc: Acc): Promise<DukeState> => {
  const flight = state.inFlight;
  if (!flight || flight.kind !== "RAID") return state;
  const at = ctx.now();
  const owner = world.ownerOfSeason.get(flight.seasonId);
  const tier = world.tierOfSeason.get(flight.seasonId);
  if (!owner || !tier || owner === state.authUid) {
    // Target vanished (transferred/lost): the Fighter simply returns home.
    const home = { ...state, inFlight: null, fighters: [...state.fighters, { hull: flight.fighterHull }] };
    return pushDigest(home, at, "COMBAT", "Your Fighter found nothing to raid and returned.").state;
  }
  const label = await ctx.labelFor(flight.seasonId);
  return ctx.withLock(owner, async () => {
    const defender = (await ctx.deps.dukeStore.get(owner)) ?? null;
    const stability = await ctx.deps.galaxyEconomyStore.ensureStability({ authUid: owner, seasonId: flight.seasonId, tier });
    const step = resolveRaidArrival(state, defender, { seasonId: flight.seasonId, label, stability: stability.stability }, at);
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
  });
};

// Advances one Duke to `now`. Returns undefined when the account is not a Duke.
export const advanceOneDuke = async (ctx: DukeContext, world: DukeWorld, authUid: string): Promise<DukeState | undefined> => {
  const holdings = world.holdingsByOwner.get(authUid) ?? [];
  if (!holdings.some((h) => h.tier === "PLANET")) return undefined;
  const cycleIndex = currentGlobalCycleIndex(ctx.now());
  return ctx.withLock(authUid, async () => {
    const at = ctx.now();
    let state = (await ctx.deps.dukeStore.get(authUid)) ?? createDukeState(authUid, at, cycleIndex);
    const acc: Acc = { effects: [], counters: [] };

    const produced = advanceProduction(state, totalDailyProduction(holdings), at);
    state = produced.state;
    if (produced.completed) {
      const done = applyCompletedBuild(state, produced.completed, at);
      state = done.state;
      acc.effects.push(...done.effects);
      acc.counters.push(...done.counters);
    }

    if (state.inFlight && at >= state.inFlight.arrivesAt) {
      state = state.inFlight.kind === "PROBE" ? await resolveProbe(ctx, world, state, acc) : await resolveRaid(ctx, world, state, acc);
    }

    const credited = creditIncursion(state, world.dukeUids.length, cycleIndex, at);
    state = credited.state;
    acc.counters.push(...credited.counters);
    const landed = landIncursion(state, await heldStabilities(ctx, world, authUid), at);
    state = landed.state;
    acc.effects.push(...landed.effects);
    acc.counters.push(...landed.counters);

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

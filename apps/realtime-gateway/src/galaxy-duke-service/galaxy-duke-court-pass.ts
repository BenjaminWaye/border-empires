// The Court's own moves, once per Duke tick across every Duke (§21.3, §21.6):
// it turns a blind eye to a runaway leader (and drains their weakest Sector
// each Cycle while it does), and it quietly offers Writs. Needs every Duke's
// Domain Weight, so it runs after the per-Duke tick, under the one Duke lock.
import { rankDomainWeights } from "../galaxy-court/galaxy-court.js";
import { favorOf, isRunaway, maybeOfferWrit, updateFavor, writChancePercent, type WritRival } from "../galaxy-duke-engine/galaxy-duke-court-favor.js";
import { pushDigest } from "../galaxy-duke-engine/galaxy-duke-digest.js";
import { BLIND_EYE_DRAIN_PER_CYCLE } from "../galaxy-duke-engine/galaxy-duke-politics-config.js";
import { planetsOf } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { currentGlobalCycleIndex } from "../galaxy-senate-tick/galaxy-senate-tick.js";
import type { DukeContext, DukeWorld } from "./galaxy-duke-context.js";
import { courtNow, domainWeights } from "./galaxy-duke-court.js";
import { heldSectors } from "./galaxy-duke-tick.js";

const firstPlanet = (world: DukeWorld, authUid: string): string | undefined => planetsOf(world.holdingsByOwner.get(authUid) ?? [])[0]?.seasonId;

// The Blind Eye's drain: the weakest held Sector loses Stability, once a Cycle.
const drainWeakest = async (ctx: DukeContext, world: DukeWorld, state: DukeState, cycleIndex: number): Promise<DukeState> => {
  const favor = favorOf(state);
  if (!favor.revoked || favor.lastDrainCycle === cycleIndex) return state;
  const sectors = [...(await heldSectors(ctx, world, state.authUid)).entries()].sort((a, b) => a[1].stability - b[1].stability);
  const weakest = sectors[0];
  let next: DukeState = { ...state, favor: { ...favor, lastDrainCycle: cycleIndex } };
  if (!weakest) return next;
  const contested = await ctx.applyEffects(state.authUid, [{ kind: "STABILITY_DELTA", seasonId: weakest[0], delta: -BLIND_EYE_DRAIN_PER_CYCLE }], world);
  const pushed = pushDigest(next, ctx.now(), "COURT", `With the Court looking away, unrest spreads on ${weakest[1].label}: -${BLIND_EYE_DRAIN_PER_CYCLE} Stability.`);
  ctx.countAll(pushed.counters);
  next = await ctx.noteContested(pushed.state, contested, ctx.now());
  return next;
};

export const runCourtPass = (ctx: DukeContext): Promise<void> =>
  ctx.withLock(async () => {
    const world = await ctx.loadWorld();
    if (world.dukeUids.length === 0) return;
    const { strength, contributions } = await courtNow(ctx, world);
    if (strength.fallen) return;
    const ranks = rankDomainWeights(await domainWeights(ctx, world, contributions));
    const at = ctx.now();
    const cycleIndex = currentGlobalCycleIndex(at);
    const topHalf = Math.ceil(ranks.length / 2);
    for (const r of ranks) {
      const stored = await ctx.deps.dukeStore.get(r.authUid);
      if (!stored) continue;
      const runaway = r.rank === 1 && isRunaway(r.weight, ranks[1]?.weight ?? null);
      const favored = updateFavor(stored, runaway, at);
      ctx.countAll(favored.counters);
      let state = await drainWeakest(ctx, world, favored.state, cycleIndex);

      // A Writ needs someone to betray: the highest-ranked other Duke.
      if (ranks.length >= 2) {
        const rivalRank = ranks.find((x) => x.authUid !== r.authUid);
        const rivalSeason = rivalRank ? firstPlanet(world, rivalRank.authUid) : undefined;
        const rival: WritRival | null = rivalRank && rivalSeason ? { authUid: rivalRank.authUid, seasonId: rivalSeason } : null;
        const chancePercent = writChancePercent(strength.current, strength.start, r.rank <= topHalf);
        const rolled = maybeOfferWrit(state, { cycleIndex, chancePercent, rival, now: at });
        state = rolled.state;
        if (rolled.offered) {
          ctx.countAll(["duke_writ_offered"]);
          const pushed = pushDigest(state, at, "COURT", "A Court envoy has come to you in private with a Writ of Advancement. Nobody else will know whether you take it.");
          ctx.countAll(pushed.counters);
          state = pushed.state;
        }
      }
      await ctx.deps.dukeStore.put(state);
    }
  });

// The Court as the service sees it: Court Strength for the current era, Domain
// Weights, and Convergence (design doc §27) -- the Court falling ends the era.
import { computeCourtStrength, computeDomainWeight, rankDomainWeights, type CourtStrength } from "../galaxy-court/galaxy-court.js";
import { buildHallEntry, courtCapturedThisEra, nextEra, type EraState, type HallStanding } from "../galaxy-duke-engine/galaxy-duke-convergence.js";
import { pushDigest } from "../galaxy-duke-engine/galaxy-duke-digest.js";
import { planetsOf } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeContext, DukeWorld } from "./galaxy-duke-context.js";
import { heldSectors } from "./galaxy-duke-tick.js";

export const domainWeights = async (ctx: DukeContext, world: DukeWorld, contributions: Record<string, number>): Promise<Map<string, number>> => {
  const weights = new Map<string, number>();
  for (const uid of world.dukeUids) {
    const holdings = world.holdingsByOwner.get(uid) ?? [];
    const sectors = await heldSectors(ctx, world, uid);
    let totalStability = 0;
    for (const s of sectors.values()) totalStability += s.stability;
    weights.set(uid, computeDomainWeight({ holdings, totalStability, committedInfluence: contributions[uid] ?? 0 }));
  }
  return weights;
};

// Court Strength counts only the Sectors captured since the current era began.
export const courtNow = async (
  ctx: DukeContext,
  world: DukeWorld
): Promise<{ strength: CourtStrength; contributions: Record<string, number>; era: EraState }> => {
  const [court, era] = await Promise.all([ctx.deps.dukeStore.getCourt(), ctx.deps.dukeStore.getEra(ctx.now())]);
  return {
    strength: computeCourtStrength({
      totalSectors: ctx.totalSectors,
      capturedSectors: courtCapturedThisEra(era, world.capturedSectors),
      committedInfluence: court.totalInfluence
    }),
    contributions: court.contributions,
    era
  };
};

const eraLabel = async (ctx: DukeContext, world: DukeWorld, authUid: string): Promise<string> => {
  const first = planetsOf(world.holdingsByOwner.get(authUid) ?? [])[0];
  return first ? ctx.labelFor(first.seasonId) : "an unnamed world";
};

// When the Court has fallen: the top Domain Weight takes the throne, the era is
// written into the Hall of Fame, the Court's wagers are cleared, and every Duke
// is told. Runs under the one Duke lock and re-reads the era inside it, so two
// ticks can never end the same era twice.
export const checkConvergence = async (ctx: DukeContext): Promise<boolean> =>
  ctx.withLock(async () => {
    const world = await ctx.loadWorld();
    const { strength, contributions, era } = await courtNow(ctx, world);
    if (!strength.fallen) return false;
    const ranks = rankDomainWeights(await domainWeights(ctx, world, contributions));
    const standings: HallStanding[] = [];
    for (const r of ranks.slice(0, 5)) standings.push({ authUid: r.authUid, label: await eraLabel(ctx, world, r.authUid), weight: r.weight });
    const at = ctx.now();
    const entry = buildHallEntry(era, standings, at);
    if (!entry) return false;
    await ctx.deps.dukeStore.endEra(entry, nextEra(era, world.capturedSectors, at));
    for (const authUid of world.dukeUids) {
      const state = await ctx.deps.dukeStore.get(authUid);
      if (!state) continue;
      const text =
        authUid === entry.emperorAuthUid
          ? `The Court has fallen. You take the throne as Emperor of era ${era.era}. Era ${era.era + 1} begins with the Court at full strength.`
          : `The Court has fallen. ${entry.emperorLabel} takes the throne for era ${era.era}. Era ${era.era + 1} begins with the Court at full strength.`;
      const pushed = pushDigest(state, at, "COURT", text);
      ctx.countAll(pushed.counters);
      await ctx.deps.dukeStore.put(pushed.state);
    }
    return true;
  });

// Political actions (§29): declare a grievance, answer a Writ, lend a Fighter
// to the Court. Like every Duke action they first advance the Duke to "now".
import { answerWrit, pendingWrit, resetFavorClock } from "../galaxy-duke-engine/galaxy-duke-court-favor.js";
import { pushDigest } from "../galaxy-duke-engine/galaxy-duke-digest.js";
import { declareGrievance, lendFighter } from "../galaxy-duke-engine/galaxy-duke-grievance.js";
import { GRIEVANCE_COST_INFLUENCE, LEND_INFLUENCE_STIPEND } from "../galaxy-duke-engine/galaxy-duke-politics-config.js";
import { planetsOf } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeContext, DukeWorld } from "./galaxy-duke-context.js";
import { saveDuke, withDuke, type DukeActionResult } from "./galaxy-duke-actions.js";

const addInfluence = async (ctx: DukeContext, authUid: string, delta: number): Promise<void> => {
  const balance = await ctx.deps.galaxyEconomyStore.getBalance(authUid);
  await ctx.deps.galaxyEconomyStore.upsertBalance({
    authUid,
    influence: (balance?.influence ?? 0) + delta,
    production: balance?.production ?? 0,
    lastCycleAt: balance?.lastCycleAt ?? ctx.now()
  });
};

// A Duke is named by their first Planet everywhere in the Duke layer.
export const dukeLabel = async (ctx: DukeContext, world: DukeWorld, authUid: string): Promise<string> => {
  const first = planetsOf(world.holdingsByOwner.get(authUid) ?? [])[0];
  return first ? ctx.labelFor(first.seasonId) : "an unnamed world";
};

// The cost to declare against `targetUid`: free against a Duke the Court has
// turned a blind eye to (§21.6), so rivals can pile on a runaway leader.
export const grievanceCostAgainst = async (ctx: DukeContext, targetUid: string): Promise<number> =>
  (await ctx.deps.dukeStore.get(targetUid))?.favor?.revoked ? 0 : GRIEVANCE_COST_INFLUENCE;

// Declares against the Duke holding `targetSeasonId`. Public: the target is told.
export const declareGrievanceAction = (ctx: DukeContext, authUid: string, targetSeasonId: string): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state, world) => {
    const targetUid = world.ownerOfSeason.get(targetSeasonId);
    if (!targetUid || !world.dukeUids.includes(targetUid)) return { ok: false, code: "NOT_A_RIVAL" };
    const at = ctx.now();
    const cost = await grievanceCostAgainst(ctx, targetUid);
    const influence = (await ctx.deps.galaxyEconomyStore.getBalance(authUid))?.influence ?? 0;
    if (influence < cost) return { ok: false, code: "INSUFFICIENT_INFLUENCE" };
    const declared = declareGrievance(state, targetUid, await dukeLabel(ctx, world, targetUid), at);
    if (!declared.ok) return declared;
    if (cost > 0) await addInfluence(ctx, authUid, -cost);
    const target = await ctx.deps.dukeStore.get(targetUid);
    if (target) {
      const text = `${await dukeLabel(ctx, world, authUid)} declared a grievance against you. For 14 days their raids on you earn them Renown. Station Fighters to hold them off.`;
      const told = pushDigest(target, at, "POLITICS", text);
      ctx.countAll(told.counters);
      await ctx.deps.dukeStore.put(told.state);
    }
    return saveDuke(ctx, declared.state);
  });

// Taking a Writ gives the Court back 3 Strength; refusing leaves no trace.
export const answerWritAction = (ctx: DukeContext, authUid: string, accept: boolean): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state) => {
    const at = ctx.now();
    const offer = pendingWrit(state, at);
    const answered = answerWrit(state, accept, at);
    if (!answered.ok) return answered;
    if (!answered.accepted || !offer) return saveDuke(ctx, pushDigest(answered.state, at, "COURT", "You sent the Court's envoy away.").state);
    await ctx.deps.dukeStore.addWritAccepted();
    ctx.countAll(["duke_writ_accepted"]);
    const text =
      offer.kind === "FIGHTER"
        ? "You took the Court's Writ: a Fighter has joined your fleet. The Court grows a little stronger."
        : `You took the Court's Writ: a Court Fighter is on its way to raid ${await ctx.labelFor(offer.targetSeasonId)}. It will look like any other raid. The Court grows a little stronger.`;
    return saveDuke(ctx, pushDigest(answered.state, at, "COURT", text).state);
  });

// Lend a Fighter to the Court for a Cycle: a small stipend, and the Court's
// Favor is restored (§21.6).
export const lendFleetAction = (ctx: DukeContext, authUid: string, fromSeasonId: string): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state) => {
    const at = ctx.now();
    const lent = lendFighter(state, fromSeasonId, at);
    if (!lent.ok) return lent;
    await addInfluence(ctx, authUid, LEND_INFLUENCE_STIPEND);
    const wasRevoked = state.favor?.revoked === true;
    const text = `You lent a Fighter to the Court for 7 days: +${LEND_INFLUENCE_STIPEND} Influence.${wasRevoked ? " The Court's Favor is restored." : ""}`;
    return saveDuke(ctx, pushDigest(resetFavorClock(lent.state, at), at, "COURT", text).state);
  });

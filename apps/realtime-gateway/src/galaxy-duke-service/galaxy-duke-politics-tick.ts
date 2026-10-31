// The per-Duke politics steps of the Duke tick (§29): closing grievances,
// bringing lent Fighters home, and paying the attacker when a raid made under
// a grievance gets through. Runs inside the one Duke lock.
import { pushDigest } from "../galaxy-duke-engine/galaxy-duke-digest.js";
import { creditGrievanceHit, expireGrievance, returnLentFighters } from "../galaxy-duke-engine/galaxy-duke-grievance.js";
import { GRIEVANCE_PLUNDER_INFLUENCE } from "../galaxy-duke-engine/galaxy-duke-politics-config.js";
import type { DukeCounter, DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import type { DukeContext } from "./galaxy-duke-context.js";

export const tickPolitics = (state: DukeState, now: number): { state: DukeState; counters: DukeCounter[] } => {
  const expired = expireGrievance(state, now);
  const returned = returnLentFighters(expired.state, now);
  return { state: returned.state, counters: [...expired.counters, ...returned.counters] };
};

const addInfluence = async (ctx: DukeContext, authUid: string, delta: number, at: number): Promise<void> => {
  const balance = await ctx.deps.galaxyEconomyStore.getBalance(authUid);
  await ctx.deps.galaxyEconomyStore.upsertBalance({
    authUid,
    influence: (balance?.influence ?? 0) + delta,
    production: balance?.production ?? 0,
    lastCycleAt: balance?.lastCycleAt ?? at
  });
};

// A raid got through on `defenderUid`'s system `targetLabel`. If the attacker
// holds an open grievance against them, it earns Renown and takes a little
// Influence (never more than the defender has). The defender is told publicly:
// a grievance is an open claim, unlike a Writ.
export const creditRaidThrough = async (
  ctx: DukeContext,
  attacker: DukeState,
  defenderUid: string,
  defender: DukeState | null,
  targetLabel: string,
  at: number
): Promise<DukeState> => {
  const credited = creditGrievanceHit(attacker, defenderUid, defender?.favor?.revoked === true, at);
  if (credited.renown === 0) return attacker;
  const defenderInfluence = (await ctx.deps.galaxyEconomyStore.getBalance(defenderUid))?.influence ?? 0;
  const plunder = Math.max(0, Math.min(GRIEVANCE_PLUNDER_INFLUENCE, Math.floor(defenderInfluence)));
  if (plunder > 0) {
    await addInfluence(ctx, defenderUid, -plunder, at);
    await addInfluence(ctx, attacker.authUid, plunder, at);
  }
  const fresh = await ctx.deps.dukeStore.get(defenderUid);
  if (fresh) {
    const told = pushDigest(fresh, at, "POLITICS", `That raid on ${targetLabel} was pressed under a declared grievance${plunder > 0 ? `: -${plunder} Influence` : ""}.`);
    ctx.countAll(told.counters);
    await ctx.deps.dukeStore.put(told.state);
  }
  const plunderText = plunder > 0 ? ` and ${plunder} Influence` : "";
  const pushed = pushDigest(credited.state, at, "POLITICS", `Your grievance paid off at ${targetLabel}: +${credited.renown} Renown${plunderText}.`);
  ctx.countAll(pushed.counters);
  return pushed.state;
};

// Player actions for the Duke layer (§26, §30). Each one first advances the Duke
// to "now" (so nobody acts on stale state). The daily rhythm: each system has
// one order a day (build, fortify, launch) and the Duke one decree a day
// (Move Against the Court, Hold Court, and the decrees in
// galaxy-duke-politics-actions.ts). Answering offers and cancelling are free.
import { answerCourtOffer, isMoveAgainstCourtLocked } from "../galaxy-court-offer/galaxy-court-offer.js";
import { FORTIFY_STABILITY, HOLD_COURT_INFLUENCE, MIN_MOVE_AGAINST_COURT_WAGER, MOVE_AGAINST_COURT_DIVISOR } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { takeDecree, takeOrder, type DailyGateError } from "../galaxy-duke-engine/galaxy-duke-daily.js";
import { pushDigest } from "../galaxy-duke-engine/galaxy-duke-digest.js";
import { launchProbe, launchRaid, type OrderErrorCode } from "../galaxy-duke-engine/galaxy-duke-orders.js";
import type { WritErrorCode } from "../galaxy-duke-engine/galaxy-duke-court-favor.js";
import type { DeclareErrorCode, LendErrorCode } from "../galaxy-duke-engine/galaxy-duke-grievance.js";
import { cancelBuild, planBuild, startPlannedBuild, type BuildSpec, type PlanBuildErrorCode } from "../galaxy-duke-engine/galaxy-duke-production.js";
import { findSystem, planetsOf } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import type { DukeContext, DukeWorld } from "./galaxy-duke-context.js";
import { courtNow } from "./galaxy-duke-court.js";
import { advanceOneDuke } from "./galaxy-duke-tick.js";

export type DukeActionError =
  | {
      ok: false;
      code:
        | "NOT_A_DUKE"
        | "INVALID"
        | "COURT_HAS_FALLEN"
        | "LOCKED_BY_COURT_OFFER"
        | "INSUFFICIENT_INFLUENCE"
        | "NO_PENDING_OFFER"
        | "NOTHING_TO_CANCEL"
        | "COURT_AT_FULL_STRENGTH"
        | "NOT_NEEDED_BY_COURT"
        | "ALREADY_STABLE"
        | PlanBuildErrorCode
        | OrderErrorCode
        | DeclareErrorCode
        | WritErrorCode
        | LendErrorCode;
    }
  | DailyGateError;

export type DukeActionResult = { ok: true; state: DukeState } | DukeActionError;

export type OrderSpec = { kind: "PROBE" | "RAID"; targetSeasonId: string };

// Loads the freshly-advanced Duke and runs `fn` on it under the Duke's lock.
export const withDuke = async (
  ctx: DukeContext,
  authUid: string,
  fn: (state: DukeState, world: DukeWorld) => Promise<DukeActionResult>
): Promise<DukeActionResult> => {
  const world = await ctx.loadWorld();
  if (!(await advanceOneDuke(ctx, world, authUid))) return { ok: false, code: "NOT_A_DUKE" };
  return ctx.withLock(async () => {
    const state = await ctx.deps.dukeStore.get(authUid);
    return state ? fn(state, world) : { ok: false, code: "NOT_A_DUKE" };
  });
};

export const saveDuke = async (ctx: DukeContext, state: DukeState): Promise<DukeActionResult> => {
  await ctx.deps.dukeStore.put(state);
  return { ok: true, state };
};

const hoursText = (ms: number): string => {
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  return `${hours} hour${hours === 1 ? "" : "s"}`;
};

const addInfluence = async (ctx: DukeContext, authUid: string, delta: number): Promise<void> => {
  const balance = await ctx.deps.galaxyEconomyStore.getBalance(authUid);
  await ctx.deps.galaxyEconomyStore.upsertBalance({
    authUid,
    influence: (balance?.influence ?? 0) + delta,
    production: balance?.production ?? 0,
    lastCycleAt: balance?.lastCycleAt ?? ctx.now()
  });
};

// Order: start a build in this system's one slot.
export const buildAction = (ctx: DukeContext, authUid: string, seasonId: string, spec: BuildSpec): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state, world) => {
    if (!planetsOf(world.holdingsByOwner.get(authUid) ?? []).some((h) => h.seasonId === seasonId)) return { ok: false, code: "NO_SUCH_SYSTEM" };
    const plan = planBuild(state, seasonId, spec);
    if (!plan.ok) {
      ctx.countAll(["duke_build_rejected"]);
      return plan;
    }
    const at = ctx.now();
    const ordered = takeOrder(state, seasonId, at);
    if (!ordered.ok) return ordered;
    const started = startPlannedBuild(ordered.state, seasonId, plan.build, at);
    const label = await ctx.labelFor(seasonId);
    return saveDuke(ctx, pushDigest(started, at, "ECONOMY", `Started ${plan.build.kind === "BASE" ? "a base" : plan.build.label} at ${label}: ready in ${hoursText(plan.build.durationMs)}.`).state);
  });

// Order: Fortify takes effect at once.
export const fortifyAction = (ctx: DukeContext, authUid: string, seasonId: string): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state, world) => {
    const held = planetsOf(world.holdingsByOwner.get(authUid) ?? []).find((h) => h.seasonId === seasonId);
    if (!held || !findSystem(state, seasonId)) return { ok: false, code: "NO_SUCH_SYSTEM" };
    const stability = (await ctx.deps.galaxyEconomyStore.ensureStability({ authUid, seasonId, tier: held.tier })).stability;
    if (stability >= 100) return { ok: false, code: "ALREADY_STABLE" };
    const at = ctx.now();
    const ordered = takeOrder(state, seasonId, at);
    if (!ordered.ok) return ordered;
    await ctx.applyEffects(authUid, [{ kind: "STABILITY_DELTA", seasonId, delta: FORTIFY_STABILITY }], world);
    const after = Math.min(100, stability + FORTIFY_STABILITY);
    return saveDuke(ctx, pushDigest(ordered.state, at, "ECONOMY", `Fortified ${await ctx.labelFor(seasonId)}: Stability ${stability} to ${after}.`).state);
  });

// Free: abandoning a build gives the slot back (the day's order stays spent).
export const cancelBuildAction = (ctx: DukeContext, authUid: string, seasonId: string): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state) => {
    if (!findSystem(state, seasonId)?.slot) return { ok: false, code: "NOTHING_TO_CANCEL" };
    return saveDuke(ctx, pushDigest(cancelBuild(state, seasonId), ctx.now(), "ECONOMY", "Build cancelled.").state);
  });

// Order: launch a Probe or a Fighter from this system.
export const orderAction = (ctx: DukeContext, authUid: string, fromSeasonId: string, spec: OrderSpec): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state, world) => {
    const owned = new Set((world.holdingsByOwner.get(authUid) ?? []).map((h) => h.seasonId));
    if (!world.ownerOfSeason.has(spec.targetSeasonId)) return { ok: false, code: "INVALID" };
    const at = ctx.now();
    const launched =
      spec.kind === "PROBE" ? launchProbe(state, fromSeasonId, spec.targetSeasonId, owned, at) : launchRaid(state, fromSeasonId, spec.targetSeasonId, owned, at);
    if (!launched.ok) return launched;
    const ordered = takeOrder(launched.state, fromSeasonId, at);
    return ordered.ok ? saveDuke(ctx, ordered.state) : ordered;
  });

export const answerCourtOfferAction = (ctx: DukeContext, authUid: string, accept: boolean): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state) => {
    if (state.courtOffer.status !== "PENDING") return { ok: false, code: "NO_PENDING_OFFER" };
    const at = ctx.now();
    const text = accept
      ? "You accepted the Court's protection. Wardens will leave you alone for 30 days, and you cannot Move Against the Court for 90."
      : "You declined the Court's offer. It will not be made again.";
    return saveDuke(ctx, pushDigest({ ...state, courtOffer: answerCourtOffer(state.courtOffer, accept, at) }, at, "COURT", text).state);
  });

// Decree: Hold Court, the decree that is always worth taking (+1 Influence).
export const holdCourtAction = (ctx: DukeContext, authUid: string): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state) => {
    const at = ctx.now();
    const decreed = takeDecree(state, at);
    if (!decreed.ok) return decreed;
    await addInfluence(ctx, authUid, HOLD_COURT_INFLUENCE);
    return saveDuke(ctx, pushDigest(decreed.state, at, "POLITICS", `You held court: +${HOLD_COURT_INFLUENCE} Influence.`).state);
  });

// Decree: Move Against the Court (§21.2), a direct wager that takes effect at
// once. The full design needs a quorum of >=3 voters, which a young galaxy
// cannot reach.
export const moveAgainstCourtAction = (ctx: DukeContext, authUid: string, influence: number): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state, world) => {
    const at = ctx.now();
    const wager = Math.floor(influence);
    if (!Number.isFinite(wager) || wager < MIN_MOVE_AGAINST_COURT_WAGER) return { ok: false, code: "INVALID" };
    if (isMoveAgainstCourtLocked(state.courtOffer, at)) return { ok: false, code: "LOCKED_BY_COURT_OFFER" };
    const { strength } = await courtNow(ctx, world);
    if (strength.fallen) return { ok: false, code: "COURT_HAS_FALLEN" };
    const balance = await ctx.deps.galaxyEconomyStore.getBalance(authUid);
    if ((balance?.influence ?? 0) < wager) return { ok: false, code: "INSUFFICIENT_INFLUENCE" };
    const decreed = takeDecree(state, at);
    if (!decreed.ok) return decreed;
    await addInfluence(ctx, authUid, -wager);
    await ctx.deps.dukeStore.addCourtContribution(authUid, wager);
    const { strength: now } = await courtNow(ctx, world);
    const gain = Math.round((wager / MOVE_AGAINST_COURT_DIVISOR) * 10) / 10;
    const text = `You committed ${wager} Influence against the Court. Court Strength ${strength.current} to ${now.current} (-${strength.current - now.current}). Your Domain Weight +${gain}.${now.fallen ? " The Court has fallen." : ""}`;
    return saveDuke(ctx, pushDigest(decreed.state, at, "POLITICS", text).state);
  });

// Player actions for the Duke layer (§26). Each one first advances the Duke to
// "now" (so nobody acts on stale state). Builds and orders are per system and
// limited only by the system's own slot and ships; the single weekly gate left
// is one Petition (Move Against the Court) per Duke per Cycle.
import { tryTakeAction } from "../galaxy-action-gate/galaxy-action-gate.js";
import { answerCourtOffer, isMoveAgainstCourtLocked } from "../galaxy-court-offer/galaxy-court-offer.js";
import { computeCourtStrength } from "../galaxy-court/galaxy-court.js";
import { MIN_MOVE_AGAINST_COURT_WAGER, MOVE_AGAINST_COURT_DIVISOR } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { pushDigest } from "../galaxy-duke-engine/galaxy-duke-digest.js";
import { launchProbe, launchRaid, type OrderErrorCode } from "../galaxy-duke-engine/galaxy-duke-orders.js";
import {
  cancelBuild,
  planBuild,
  startPlannedBuild,
  type BuildSpec,
  type PlanBuildErrorCode
} from "../galaxy-duke-engine/galaxy-duke-production.js";
import { findSystem, planetsOf, systemDailyRate } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { daysToComplete } from "../galaxy-production-queue/galaxy-production-queue.js";
import type { DukeContext, DukeWorld } from "./galaxy-duke-context.js";
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
        | PlanBuildErrorCode
        | OrderErrorCode;
    }
  | { ok: false; code: "PETITION_ALREADY_MADE_THIS_CYCLE"; availableAt: number };
export type DukeActionResult = { ok: true; state: DukeState } | DukeActionError;

export type OrderSpec = { kind: "PROBE" | "RAID"; targetSeasonId: string };

// Loads the freshly-advanced Duke and runs `fn` on it under the Duke's lock.
const withDuke = async (
  ctx: DukeContext,
  authUid: string,
  fn: (state: DukeState, world: DukeWorld) => Promise<DukeActionResult>
): Promise<DukeActionResult> => {
  const world = await ctx.loadWorld();
  if (!(await advanceOneDuke(ctx, world, authUid))) return { ok: false, code: "NOT_A_DUKE" };
  return ctx.withLock(authUid, async () => {
    const state = await ctx.deps.dukeStore.get(authUid);
    return state ? fn(state, world) : { ok: false, code: "NOT_A_DUKE" };
  });
};

const save = async (ctx: DukeContext, state: DukeState): Promise<DukeActionResult> => {
  await ctx.deps.dukeStore.put(state);
  return { ok: true, state };
};

export const buildAction = (ctx: DukeContext, authUid: string, seasonId: string, spec: BuildSpec): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state, world) => {
    const held = planetsOf(world.holdingsByOwner.get(authUid) ?? []).find((h) => h.seasonId === seasonId);
    if (!held) return { ok: false, code: "NO_SUCH_SYSTEM" };
    const stability = (await ctx.deps.galaxyEconomyStore.ensureStability({ authUid, seasonId, tier: held.tier })).stability;
    const plan = planBuild(state, seasonId, spec, stability);
    if (!plan.ok) {
      ctx.countAll(["duke_build_rejected"]);
      return plan;
    }
    const started = startPlannedBuild(state, seasonId, plan.build);
    const system = findSystem(started, seasonId)!;
    const days = daysToComplete(plan.build.cost - (system.slot?.progress ?? 0), systemDailyRate(system));
    const eta = Number.isFinite(days) ? `about ${days} day${days === 1 ? "" : "s"}` : "no end in sight";
    const label = await ctx.labelFor(seasonId);
    return save(ctx, pushDigest(started, ctx.now(), "ECONOMY", `Started ${plan.build.label} at ${label}: ${eta}.`).state);
  });

// Abandoning a build loses its progress.
export const cancelBuildAction = (ctx: DukeContext, authUid: string, seasonId: string): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state) => {
    if (!findSystem(state, seasonId)?.slot) return { ok: false, code: "NOTHING_TO_CANCEL" };
    return save(ctx, pushDigest(cancelBuild(state, seasonId), ctx.now(), "ECONOMY", "Build cancelled. Its progress was lost.").state);
  });

export const orderAction = (ctx: DukeContext, authUid: string, fromSeasonId: string, spec: OrderSpec): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state, world) => {
    const owned = new Set((world.holdingsByOwner.get(authUid) ?? []).map((h) => h.seasonId));
    if (!world.ownerOfSeason.has(spec.targetSeasonId)) return { ok: false, code: "INVALID" };
    const launched =
      spec.kind === "PROBE"
        ? launchProbe(state, fromSeasonId, spec.targetSeasonId, owned, ctx.now())
        : launchRaid(state, fromSeasonId, spec.targetSeasonId, owned, ctx.now());
    return launched.ok ? save(ctx, launched.state) : launched;
  });

export const answerCourtOfferAction = (ctx: DukeContext, authUid: string, accept: boolean): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state) => {
    if (state.courtOffer.status !== "PENDING") return { ok: false, code: "NO_PENDING_OFFER" };
    const at = ctx.now();
    const text = accept
      ? "You accepted the Court's protection. Wardens will leave you alone for 30 days, and you cannot Move Against the Court for 90."
      : "You declined the Court's offer. It will not be made again.";
    return save(ctx, pushDigest({ ...state, courtOffer: answerCourtOffer(state.courtOffer, accept, at) }, at, "COURT", text).state);
  });

// Move Against the Court (§21.2). MVP simplification: a direct wager that takes
// effect immediately. The full design needs a quorum of >=3 distinct voters,
// which a young galaxy cannot reach. One per Duke per Cycle.
export const moveAgainstCourtAction = (ctx: DukeContext, authUid: string, influence: number): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state, world) => {
    const at = ctx.now();
    const wager = Math.floor(influence);
    if (!Number.isFinite(wager) || wager < MIN_MOVE_AGAINST_COURT_WAGER) return { ok: false, code: "INVALID" };
    if (isMoveAgainstCourtLocked(state.courtOffer, at)) return { ok: false, code: "LOCKED_BY_COURT_OFFER" };
    const before = await ctx.deps.dukeStore.getCourt();
    const strength = computeCourtStrength({ totalSectors: ctx.totalSectors, capturedSectors: world.capturedSectors, committedInfluence: before.totalInfluence });
    if (strength.fallen) return { ok: false, code: "COURT_HAS_FALLEN" };
    const balance = await ctx.deps.galaxyEconomyStore.getBalance(authUid);
    if ((balance?.influence ?? 0) < wager) return { ok: false, code: "INSUFFICIENT_INFLUENCE" };
    const gated = tryTakeAction(state.petitionGate, "PETITION_SENATE", at);
    if (!gated.ok) return { ok: false, code: "PETITION_ALREADY_MADE_THIS_CYCLE", availableAt: gated.availableAt };
    await ctx.deps.galaxyEconomyStore.upsertBalance({
      authUid,
      influence: (balance?.influence ?? 0) - wager,
      production: balance?.production ?? 0,
      lastCycleAt: balance?.lastCycleAt ?? at
    });
    const after = await ctx.deps.dukeStore.addCourtContribution(authUid, wager);
    const now = computeCourtStrength({ totalSectors: ctx.totalSectors, capturedSectors: world.capturedSectors, committedInfluence: after.totalInfluence });
    const gain = Math.round((wager / MOVE_AGAINST_COURT_DIVISOR) * 10) / 10;
    const text = `You committed ${wager} Influence against the Court. Court Strength ${strength.current} to ${now.current} (-${strength.current - now.current}). Your Domain Weight +${gain}.${now.fallen ? " The Court has fallen." : ""}`;
    return save(ctx, pushDigest({ ...state, petitionGate: gated.state }, at, "POLITICS", text).state);
  });

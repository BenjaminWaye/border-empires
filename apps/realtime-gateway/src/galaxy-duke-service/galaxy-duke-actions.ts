// Player actions for the Duke layer (§26). Each one first advances the Duke to
// "now" (so nobody acts on stale state), then takes the weekly action gate for
// Invest / Petition / Give an order. Court-offer answers, Defend and Body
// Surveys are never gated (§21.12).
import { tryTakeAction, type GalaxyActionKind } from "../galaxy-action-gate/galaxy-action-gate.js";
import { answerCourtOffer, isMoveAgainstCourtLocked } from "../galaxy-court-offer/galaxy-court-offer.js";
import { computeCourtStrength } from "../galaxy-court/galaxy-court.js";
import { MIN_MOVE_AGAINST_COURT_WAGER, MOVE_AGAINST_COURT_DIVISOR } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { pushDigest } from "../galaxy-duke-engine/galaxy-duke-digest.js";
import { launchProbe, launchRaid, type OrderErrorCode } from "../galaxy-duke-engine/galaxy-duke-orders.js";
import {
  cancelBuild,
  planBuild,
  startPlannedBuild,
  totalDailyProduction,
  type BuildSpec,
  type PlanBuildResult
} from "../galaxy-duke-engine/galaxy-duke-production.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { daysToComplete } from "../galaxy-production-queue/galaxy-production-queue.js";
import type { DukeContext } from "./galaxy-duke-context.js";
import { advanceOneDuke } from "./galaxy-duke-tick.js";

type PlanErrorCode = Extract<PlanBuildResult, { ok: false }>["code"];
export type DukeActionError =
  | { ok: false; code: "NOT_A_DUKE" | "INVALID" | "COURT_HAS_FALLEN" | "LOCKED_BY_COURT_OFFER" | "INSUFFICIENT_INFLUENCE" | "NO_PENDING_OFFER" | "NOTHING_TO_CANCEL" | PlanErrorCode | OrderErrorCode }
  | { ok: false; code: "ACTION_ALREADY_TAKEN_THIS_CYCLE"; availableAt: number };
export type DukeActionResult = { ok: true; state: DukeState } | DukeActionError;

export type OrderSpec = { kind: "PROBE" | "RAID"; seasonId: string };

// Loads the freshly-advanced Duke and runs `fn` on it under the Duke's lock.
const withDuke = async (
  ctx: DukeContext,
  authUid: string,
  fn: (state: DukeState, world: Awaited<ReturnType<DukeContext["loadWorld"]>>) => Promise<DukeActionResult>
): Promise<DukeActionResult> => {
  const world = await ctx.loadWorld();
  if (!(await advanceOneDuke(ctx, world, authUid))) return { ok: false, code: "NOT_A_DUKE" };
  return ctx.withLock(authUid, async () => {
    const state = await ctx.deps.dukeStore.get(authUid);
    return state ? fn(state, world) : { ok: false, code: "NOT_A_DUKE" };
  });
};

const gate = (state: DukeState, kind: GalaxyActionKind, at: number): { ok: true; state: DukeState } | DukeActionError => {
  const taken = tryTakeAction(state.actionGate, kind, at);
  return taken.ok ? { ok: true, state: { ...state, actionGate: taken.state } } : { ok: false, code: taken.code, availableAt: taken.availableAt };
};

const save = async (ctx: DukeContext, state: DukeState): Promise<DukeActionResult> => {
  await ctx.deps.dukeStore.put(state);
  return { ok: true, state };
};

export const investAction = (ctx: DukeContext, authUid: string, spec: BuildSpec): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state, world) => {
    const at = ctx.now();
    const stabilities = new Map<string, number>();
    for (const h of world.holdingsByOwner.get(authUid) ?? []) {
      stabilities.set(h.seasonId, (await ctx.deps.galaxyEconomyStore.ensureStability({ authUid, seasonId: h.seasonId, tier: h.tier })).stability);
    }
    const plan = planBuild(state, spec, (id) => stabilities.get(id));
    if (!plan.ok) {
      ctx.countAll(["duke_build_rejected"]);
      return plan;
    }
    const gated = gate(state, "INVEST", at);
    if (!gated.ok) return gated;
    const started = startPlannedBuild(gated.state, plan.build);
    const rate = totalDailyProduction(world.holdingsByOwner.get(authUid) ?? []);
    const days = daysToComplete((started.slot?.cost ?? 0) - (started.slot?.progress ?? 0), rate);
    const eta = Number.isFinite(days) ? `about ${days} day${days === 1 ? "" : "s"} at your current rate` : "never at your current rate";
    return save(ctx, pushDigest(started, at, "ECONOMY", `Started ${plan.build.label}: ${eta}.`).state);
  });

// Abandoning a build spends the Invest action and loses its progress.
export const cancelBuildAction = (ctx: DukeContext, authUid: string): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state) => {
    if (!state.slot) return { ok: false, code: "NOTHING_TO_CANCEL" };
    const gated = gate(state, "INVEST", ctx.now());
    if (!gated.ok) return gated;
    return save(ctx, pushDigest(cancelBuild(gated.state), ctx.now(), "ECONOMY", "Build cancelled. Its progress was lost.").state);
  });

export const orderAction = (ctx: DukeContext, authUid: string, spec: OrderSpec): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state, world) => {
    const at = ctx.now();
    const owned = new Set((world.holdingsByOwner.get(authUid) ?? []).map((h) => h.seasonId));
    if (!world.ownerOfSeason.has(spec.seasonId)) return { ok: false, code: "INVALID" };
    const launched = spec.kind === "PROBE" ? launchProbe(state, spec.seasonId, owned, at) : launchRaid(state, spec.seasonId, owned, at);
    if (!launched.ok) return launched;
    const gated = gate(launched.state, "GIVE_ORDER", at);
    if (!gated.ok) return gated;
    return save(ctx, gated.state);
  });

export const answerCourtOfferAction = (ctx: DukeContext, authUid: string, accept: boolean): Promise<DukeActionResult> =>
  withDuke(ctx, authUid, async (state) => {
    if (state.courtOffer.status !== "PENDING") return { ok: false, code: "NO_PENDING_OFFER" };
    const at = ctx.now();
    const text = accept
      ? "You accepted the Court's protection. Wardens will leave you alone for 30 days, and you cannot Move Against the Court for 90."
      : "You declined the Court's offer. It will not be made again.";
    const next = { ...state, courtOffer: answerCourtOffer(state.courtOffer, accept, at) };
    return save(ctx, pushDigest(next, at, "COURT", text).state);
  });

// Move Against the Court (§21.2). MVP simplification: a direct wager that takes
// effect immediately. The full design needs a quorum of >=3 distinct voters,
// which a young galaxy cannot reach.
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
    const gated = gate(state, "PETITION_SENATE", at);
    if (!gated.ok) return gated;
    await ctx.deps.galaxyEconomyStore.upsertBalance({
      authUid,
      influence: (balance?.influence ?? 0) - wager,
      production: balance?.production ?? 0,
      lastCycleAt: balance?.lastCycleAt ?? at
    });
    const after = await ctx.deps.dukeStore.addCourtContribution(authUid, wager);
    const now = computeCourtStrength({ totalSectors: ctx.totalSectors, capturedSectors: world.capturedSectors, committedInfluence: after.totalInfluence });
    const drop = strength.current - now.current;
    const gain = Math.round((wager / MOVE_AGAINST_COURT_DIVISOR) * 10) / 10;
    const text = `You committed ${wager} Influence against the Court. Court Strength ${strength.current} to ${now.current} (-${drop}). Your Domain Weight +${gain}.${now.fallen ? " The Court has fallen." : ""}`;
    return save(ctx, pushDigest(gated.state, at, "POLITICS", text).state);
  });


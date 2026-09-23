// Read model for the client (§24.4): everything Space View needs to render the
// one-choice banner, the three meters, the Docket and the digest.
import { ACTION_CYCLE_MS, nextActionAvailableAt } from "../galaxy-action-gate/galaxy-action-gate.js";
import { COURT_PROTECTION_MS, MOVE_AGAINST_COURT_LOCK_MS } from "../galaxy-court-offer/galaxy-court-offer.js";
import { computeCourtStrength, computeDomainWeight, rankDomainWeights, type CourtStrength } from "../galaxy-court/galaxy-court.js";
import { hitsRemaining } from "../galaxy-duke-engine/galaxy-duke-combat.js";
import { CYCLE_DAYS, MIN_MOVE_AGAINST_COURT_WAGER } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { totalDailyProduction } from "../galaxy-duke-engine/galaxy-duke-production.js";
import type { DigestEntry, DukeIntel, DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { daysToComplete } from "../galaxy-production-queue/galaxy-production-queue.js";
import type { DukeContext, DukeWorld } from "./galaxy-duke-context.js";
import { advanceOneDuke, heldStabilities } from "./galaxy-duke-tick.js";

export type DukeStatusView = {
  now: number;
  influence: number;
  production: {
    ratePerDay: number;
    slot: { kind: string; label: string; cost: number; progress: number; daysLeft: number | null } | null;
    idleBank: number;
  };
  ships: {
    fighterHulls: number[];
    probeStock: number;
    inFlight: { kind: "PROBE" | "RAID"; seasonId: string; arrivesAt: number } | null;
    orbiting: { seasonId: string; label: string }[];
  };
  intel: DukeIntel[];
  gate: { available: boolean; availableAt: number | null; cycleMs: number };
  court: CourtStrength & {
    myContribution: number;
    offer: { status: string; protectedUntil: number | null; moveLockedUntil: number | null };
  };
  meters: {
    sectors: { seasonId: string; label: string; stability: number; hitsRemaining: number }[];
    domainWeight: number;
    rank: number;
    dukeCount: number;
  };
  docket: {
    incursionArrivesAt: number | null;
    slotState: "EMPTY" | "BUILDING";
    canMoveAgainstCourt: boolean;
    minMoveAgainstCourtWager: number;
  };
  digest: DigestEntry[];
};

const domainWeights = async (ctx: DukeContext, world: DukeWorld, contributions: Record<string, number>): Promise<Map<string, number>> => {
  const weights = new Map<string, number>();
  for (const uid of world.dukeUids) {
    const holdings = world.holdingsByOwner.get(uid) ?? [];
    const sectors = await heldStabilities(ctx, world, uid);
    weights.set(uid, computeDomainWeight({ holdings, totalStability: sectors.reduce((s, x) => s + x.stability, 0), committedInfluence: contributions[uid] ?? 0 }));
  }
  return weights;
};

const courtStrengthFor = async (ctx: DukeContext, world: DukeWorld): Promise<{ strength: CourtStrength; contributions: Record<string, number> }> => {
  const court = await ctx.deps.dukeStore.getCourt();
  return {
    strength: computeCourtStrength({ totalSectors: ctx.totalSectors, capturedSectors: world.capturedSectors, committedInfluence: court.totalInfluence }),
    contributions: court.contributions
  };
};

export const buildDukeStatus = async (ctx: DukeContext, authUid: string): Promise<DukeStatusView | undefined> => {
  const world = await ctx.loadWorld();
  const state: DukeState | undefined = await advanceOneDuke(ctx, world, authUid);
  if (!state) return undefined;
  const now = ctx.now();
  const holdings = world.holdingsByOwner.get(authUid) ?? [];
  const ratePerDay = totalDailyProduction(holdings);
  const { strength, contributions } = await courtStrengthFor(ctx, world);
  const ranks = rankDomainWeights(await domainWeights(ctx, world, contributions));
  const mine = ranks.find((r) => r.authUid === authUid);
  const balance = await ctx.deps.galaxyEconomyStore.getBalance(authUid);
  const sectors = (await heldStabilities(ctx, world, authUid)).map((s) => ({ ...s, hitsRemaining: hitsRemaining(s.stability) }));
  const availableAt = nextActionAvailableAt(state.actionGate);
  const offer = state.courtOffer;
  const acceptedAt = offer.status === "ACCEPTED" ? offer.acceptedAt : null;
  const moveLockedUntil = acceptedAt === null ? null : acceptedAt + MOVE_AGAINST_COURT_LOCK_MS;
  const labels = new Map<string, string>();
  for (const o of state.orbiting) labels.set(o.seasonId, await ctx.labelFor(o.seasonId));

  return {
    now,
    influence: balance?.influence ?? 0,
    production: {
      ratePerDay,
      slot: state.slot
        ? {
            kind: state.slot.kind,
            label: state.slot.label,
            cost: state.slot.cost,
            progress: Math.round(state.slot.progress * 10) / 10,
            daysLeft: ratePerDay > 0 ? daysToComplete(state.slot.cost - state.slot.progress, ratePerDay) : null
          }
        : null,
      idleBank: Math.round(state.idleBank * 10) / 10
    },
    ships: {
      fighterHulls: state.fighters.map((f) => f.hull),
      probeStock: state.probeStock,
      inFlight: state.inFlight ? { kind: state.inFlight.kind, seasonId: state.inFlight.seasonId, arrivesAt: state.inFlight.arrivesAt } : null,
      orbiting: state.orbiting.map((o) => ({ seasonId: o.seasonId, label: labels.get(o.seasonId) ?? "an unnamed world" }))
    },
    intel: state.intel,
    gate: { available: now >= availableAt, availableAt: now >= availableAt ? null : availableAt, cycleMs: ACTION_CYCLE_MS },
    court: {
      ...strength,
      myContribution: contributions[authUid] ?? 0,
      offer: {
        status: offer.status,
        protectedUntil: acceptedAt === null ? null : acceptedAt + COURT_PROTECTION_MS,
        moveLockedUntil
      }
    },
    meters: { sectors, domainWeight: mine?.weight ?? 0, rank: mine?.rank ?? 0, dukeCount: ranks.length },
    docket: {
      incursionArrivesAt: state.incursion.arrivesAt,
      slotState: state.slot ? "BUILDING" : "EMPTY",
      canMoveAgainstCourt: !strength.fallen && (moveLockedUntil === null || now >= moveLockedUntil),
      minMoveAgainstCourtWager: MIN_MOVE_AGAINST_COURT_WAGER
    },
    digest: [...state.digest].reverse().slice(0, 30)
  };
};

export type CourtPublicView = CourtStrength & { dukeCount: number; leaderWeight: number | null; cycleDays: number };

// Public: the shared meter everyone sees, and the top Domain Weight (no names).
export const buildCourtPublicStatus = async (ctx: DukeContext): Promise<CourtPublicView> => {
  const world = await ctx.loadWorld();
  const { strength, contributions } = await courtStrengthFor(ctx, world);
  const ranks = rankDomainWeights(await domainWeights(ctx, world, contributions));
  return { ...strength, dukeCount: ranks.length, leaderWeight: ranks[0]?.weight ?? null, cycleDays: CYCLE_DAYS };
};

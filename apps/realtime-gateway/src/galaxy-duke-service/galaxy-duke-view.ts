// Read model for the client (§24.4): everything Space View needs to render the
// attention list, the three meters, the planet panel, the Court tab and the log.
import { nextActionAvailableAt } from "../galaxy-action-gate/galaxy-action-gate.js";
import { COURT_PROTECTION_MS, MOVE_AGAINST_COURT_LOCK_MS } from "../galaxy-court-offer/galaxy-court-offer.js";
import { rankDomainWeights, type CourtStrength } from "../galaxy-court/galaxy-court.js";
import type { HallEntry } from "../galaxy-duke-engine/galaxy-duke-convergence.js";
import { CYCLE_DAYS, MIN_MOVE_AGAINST_COURT_WAGER, WARDEN_POOL_PER_CYCLE } from "../galaxy-duke-engine/galaxy-duke-config.js";
import { developmentUpkeepPerCycle } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DigestEntry, DukeIntel } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { incursionRatePerCycle } from "../galaxy-duke-engine/galaxy-duke-incursion.js";
import type { DukeContext, DukeWorld } from "./galaxy-duke-context.js";
import { buildAttention, type AttentionItem } from "./galaxy-duke-attention.js";
import { buildSystemView, type SystemView } from "./galaxy-duke-system-view.js";
import { courtNow, domainWeights } from "./galaxy-duke-court.js";
import { advanceOneDuke, heldSectors } from "./galaxy-duke-tick.js";

export type DukeStatusView = {
  now: number;
  influence: number;
  systems: SystemView[];
  attention: AttentionItem[];
  flights: { kind: "PROBE" | "RAID"; fromSeasonId: string; seasonId: string; arrivesAt: number }[];
  orbiting: { seasonId: string; label: string }[];
  intel: DukeIntel[];
  petition: { available: boolean; availableAt: number | null };
  court: CourtStrength & {
    myContribution: number;
    offer: { status: string; protectedUntil: number | null; moveLockedUntil: number | null };
    canMoveAgainstCourt: boolean;
    minWager: number;
    era: number;
    isEmperor: boolean;
    hallOfFame: HallEntry[];
  };
  meters: { domainWeight: number; rank: number; dukeCount: number };
  economy: { developmentUpkeepPerCycle: number; incursionsPerCyclePerSystem: number; wardenPoolPerCycle: number };
  digest: DigestEntry[];
};

export const buildDukeStatus = async (ctx: DukeContext, authUid: string): Promise<DukeStatusView | undefined> => {
  const world = await ctx.loadWorld();
  const state = await advanceOneDuke(ctx, world, authUid);
  if (!state) return undefined;
  const now = ctx.now();
  const { strength, contributions, era } = await courtNow(ctx, world);
  const ranks = rankDomainWeights(await domainWeights(ctx, world, contributions));
  const hall = await ctx.deps.dukeStore.getHallOfFame();
  const mine = ranks.find((r) => r.authUid === authUid);
  const balance = await ctx.deps.galaxyEconomyStore.getBalance(authUid);
  const influence = balance?.influence ?? 0;
  const sectors = await heldSectors(ctx, world, authUid);
  const systems = state.systems.map((s) => buildSystemView(state, s, sectors.get(s.seasonId)?.label ?? "an unnamed world", sectors.get(s.seasonId)?.stability ?? 100));

  const availableAt = nextActionAvailableAt(state.petitionGate);
  const petitionAvailable = now >= availableAt;
  const offer = state.courtOffer;
  const acceptedAt = offer.status === "ACCEPTED" ? offer.acceptedAt : null;
  const moveLockedUntil = acceptedAt === null ? null : acceptedAt + MOVE_AGAINST_COURT_LOCK_MS;
  const canMove = !strength.fallen && (moveLockedUntil === null || now >= moveLockedUntil);
  const labels = new Map<string, string>();
  for (const o of state.orbiting) labels.set(o.seasonId, await ctx.labelFor(o.seasonId));

  return {
    now,
    influence,
    systems,
    attention: buildAttention({ systems, courtOfferPending: offer.status === "PENDING", petitionReady: petitionAvailable && canMove && influence >= MIN_MOVE_AGAINST_COURT_WAGER }),
    flights: state.flights.map((f) => ({ kind: f.kind, fromSeasonId: f.fromSeasonId, seasonId: f.seasonId, arrivesAt: f.arrivesAt })),
    orbiting: state.orbiting.map((o) => ({ seasonId: o.seasonId, label: labels.get(o.seasonId) ?? "an unnamed world" })),
    intel: state.intel,
    petition: { available: petitionAvailable, availableAt: petitionAvailable ? null : availableAt },
    court: {
      ...strength,
      myContribution: contributions[authUid] ?? 0,
      offer: { status: offer.status, protectedUntil: acceptedAt === null ? null : acceptedAt + COURT_PROTECTION_MS, moveLockedUntil },
      canMoveAgainstCourt: canMove,
      minWager: MIN_MOVE_AGAINST_COURT_WAGER,
      era: era.era,
      isEmperor: hall[0]?.emperorAuthUid === authUid,
      hallOfFame: hall.slice(0, 5)
    },
    meters: { domainWeight: mine?.weight ?? 0, rank: mine?.rank ?? 0, dukeCount: ranks.length },
    economy: {
      developmentUpkeepPerCycle: developmentUpkeepPerCycle(state),
      incursionsPerCyclePerSystem: Math.round(incursionRatePerCycle(Math.max(1, world.capturedSectors)) * 100) / 100,
      wardenPoolPerCycle: WARDEN_POOL_PER_CYCLE
    },
    digest: [...state.digest].reverse().slice(0, 40)
  };
};

export type CourtPublicView = CourtStrength & { dukeCount: number; leaderWeight: number | null; cycleDays: number; era: number };

// Public: the shared meter everyone sees, and the top Domain Weight (no names).
export const buildCourtPublicStatus = async (ctx: DukeContext): Promise<CourtPublicView> => {
  const world = await ctx.loadWorld();
  const { strength, contributions, era } = await courtNow(ctx, world);
  const ranks = rankDomainWeights(await domainWeights(ctx, world, contributions));
  return { ...strength, dukeCount: ranks.length, leaderWeight: ranks[0]?.weight ?? null, cycleDays: CYCLE_DAYS, era: era.era };
};


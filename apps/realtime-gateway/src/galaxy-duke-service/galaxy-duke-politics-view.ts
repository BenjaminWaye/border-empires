// Read model for politics (§29): Renown, grievances (yours and against you),
// a pending Writ, Court Favor, lent Fighters and the rivals you could act on.
// Also the public raid list every client draws on the map.
import { favorOf, pendingWrit } from "../galaxy-duke-engine/galaxy-duke-court-favor.js";
import { openGrievance, renownOf } from "../galaxy-duke-engine/galaxy-duke-grievance.js";
import { planetsOf } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import type { DukeState } from "../galaxy-duke-engine/galaxy-duke-types.js";
import { isAiDuke } from "../galaxy-duke-ai/galaxy-duke-ai-policy.js";
import type { DukeContext, DukeWorld } from "./galaxy-duke-context.js";
import { dukeLabel, grievanceCostAgainst } from "./galaxy-duke-politics-actions.js";

export type DukeRivalView = { seasonId: string; label: string; weight: number; revoked: boolean; grievanceCost: number; isAi: boolean };

export type DukePoliticsView = {
  renown: number;
  grievance: { targetSeasonId: string | null; targetLabel: string; expiresAt: number; hits: number } | null;
  grievancesAgainstMe: { fromLabel: string; expiresAt: number }[];
  writ: { kind: "FIGHTER" | "STRIKE"; expiresAt: number; targetLabel: string | null } | null;
  favor: { revoked: boolean; runawaySince: number | null };
  lent: { fromSeasonId: string; returnsAt: number }[];
  rivals: DukeRivalView[];
};

// Every raid in the air, from every Duke. Raids are telegraphed on purpose
// (§7): the defender and everyone else can watch one coming. A Writ strike is
// listed like any other raid (§21.3). Probes stay private.
export type PublicRaidView = { fromSeasonId: string; seasonId: string; launchedAt: number; arrivesAt: number };

export const listPublicRaids = (states: ReadonlyArray<DukeState>, now: number): PublicRaidView[] =>
  states
    // A row from an older build may predate flights; it has none in the air.
    .flatMap((s) => (Array.isArray(s.flights) ? s.flights : []))
    .filter((f) => f.kind === "RAID" && f.arrivesAt > now)
    .map((f) => ({ fromSeasonId: f.fromSeasonId, seasonId: f.seasonId, launchedAt: f.launchedAt, arrivesAt: f.arrivesAt }))
    .sort((a, b) => a.arrivesAt - b.arrivesAt);

export const buildPoliticsView = async (
  ctx: DukeContext,
  world: DukeWorld,
  state: DukeState,
  weights: ReadonlyMap<string, number>,
  others: ReadonlyArray<DukeState>
): Promise<DukePoliticsView> => {
  const now = ctx.now();
  const open = openGrievance(state, now);
  const writ = pendingWrit(state, now);
  const favor = favorOf(state);
  const rivals: DukeRivalView[] = [];
  for (const uid of world.dukeUids) {
    if (uid === state.authUid) continue;
    const seasonId = planetsOf(world.holdingsByOwner.get(uid) ?? [])[0]?.seasonId;
    if (!seasonId) continue;
    const other = others.find((o) => o.authUid === uid);
    rivals.push({
      seasonId,
      label: await ctx.labelFor(seasonId),
      weight: weights.get(uid) ?? 0,
      revoked: other?.favor?.revoked === true,
      grievanceCost: await grievanceCostAgainst(ctx, uid),
      isAi: isAiDuke(uid)
    });
  }
  rivals.sort((a, b) => b.weight - a.weight);
  const grievancesAgainstMe: DukePoliticsView["grievancesAgainstMe"] = [];
  for (const other of others) {
    const g = openGrievance(other, now);
    if (g && g.targetAuthUid === state.authUid) grievancesAgainstMe.push({ fromLabel: await dukeLabel(ctx, world, other.authUid), expiresAt: g.expiresAt });
  }
  const targetSeason = open ? planetsOf(world.holdingsByOwner.get(open.targetAuthUid) ?? [])[0]?.seasonId ?? null : null;
  return {
    renown: renownOf(state),
    grievance: open ? { targetSeasonId: targetSeason, targetLabel: await dukeLabel(ctx, world, open.targetAuthUid), expiresAt: open.expiresAt, hits: open.hits } : null,
    grievancesAgainstMe,
    writ: writ ? { kind: writ.kind, expiresAt: writ.expiresAt, targetLabel: writ.kind === "STRIKE" ? await ctx.labelFor(writ.targetSeasonId) : null } : null,
    favor: { revoked: favor.revoked, runawaySince: favor.leadSince },
    lent: (state.lent ?? []).map((l) => ({ fromSeasonId: l.fromSeasonId, returnsAt: l.returnsAt })),
    rivals
  };
};

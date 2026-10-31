// Runs every AI Duke's turn after the Duke tick (§29.1). The AI reads the
// same facts a player sees and acts only through the player actions, so it can
// never do something a person could not.
import { rankDomainWeights } from "../galaxy-court/galaxy-court.js";
import { isMoveAgainstCourtLocked } from "../galaxy-court-offer/galaxy-court-offer.js";
import { nextActionAvailableAt } from "../galaxy-action-gate/galaxy-action-gate.js";
import { pendingWrit } from "../galaxy-duke-engine/galaxy-duke-court-favor.js";
import { openGrievance } from "../galaxy-duke-engine/galaxy-duke-grievance.js";
import { planetsOf } from "../galaxy-duke-engine/galaxy-duke-systems.js";
import {
  answerCourtOfferAction,
  buildAction,
  moveAgainstCourtAction,
  orderAction,
  type DukeActionResult
} from "../galaxy-duke-service/galaxy-duke-actions.js";
import type { DukeContext } from "../galaxy-duke-service/galaxy-duke-context.js";
import { courtNow, domainWeights } from "../galaxy-duke-service/galaxy-duke-court.js";
import { answerWritAction, declareGrievanceAction, lendFleetAction } from "../galaxy-duke-service/galaxy-duke-politics-actions.js";
import { heldSectors } from "../galaxy-duke-service/galaxy-duke-tick.js";
import { isAiDuke, planAiTurn, type AiAction, type AiRival } from "./galaxy-duke-ai-policy.js";

const perform = (ctx: DukeContext, authUid: string, action: AiAction): Promise<DukeActionResult> => {
  switch (action.kind) {
    case "ANSWER_COURT_OFFER":
      return answerCourtOfferAction(ctx, authUid, action.accept);
    case "ANSWER_WRIT":
      return answerWritAction(ctx, authUid, action.accept);
    case "BUILD":
      return buildAction(ctx, authUid, action.seasonId, action.spec);
    case "PROBE":
      return orderAction(ctx, authUid, action.fromSeasonId, { kind: "PROBE", targetSeasonId: action.targetSeasonId });
    case "RAID":
      return orderAction(ctx, authUid, action.fromSeasonId, { kind: "RAID", targetSeasonId: action.targetSeasonId });
    case "DECLARE":
      return declareGrievanceAction(ctx, authUid, action.targetSeasonId);
    case "LEND":
      return lendFleetAction(ctx, authUid, action.fromSeasonId);
    case "MOVE_AGAINST_COURT":
      return moveAgainstCourtAction(ctx, authUid, action.influence);
  }
};

export const runAiDukes = async (ctx: DukeContext): Promise<void> => {
  const world = await ctx.loadWorld();
  const aiUids = world.dukeUids.filter(isAiDuke);
  if (aiUids.length === 0) return;
  const { strength, contributions } = await courtNow(ctx, world);
  const weights = await domainWeights(ctx, world, contributions);
  const ranks = rankDomainWeights(weights);
  const rivalsBase: AiRival[] = [];
  for (const r of ranks) {
    const seasonId = planetsOf(world.holdingsByOwner.get(r.authUid) ?? [])[0]?.seasonId;
    if (!seasonId) continue;
    const revoked = (await ctx.deps.dukeStore.get(r.authUid))?.favor?.revoked === true;
    rivalsBase.push({ authUid: r.authUid, seasonId, weight: r.weight, revoked });
  }
  for (const authUid of aiUids) {
    try {
      const state = await ctx.deps.dukeStore.get(authUid);
      if (!state) continue;
      const now = ctx.now();
      const sectors = await heldSectors(ctx, world, authUid);
      const influence = (await ctx.deps.galaxyEconomyStore.getBalance(authUid))?.influence ?? 0;
      const petitionReady = !strength.fallen && now >= nextActionAvailableAt(state.petitionGate) && !isMoveAgainstCourtLocked(state.courtOffer, now);
      const actions = planAiTurn({
        state,
        now,
        influence,
        myWeight: weights.get(authUid) ?? 0,
        stabilityBySeason: new Map([...sectors.entries()].map(([id, s]) => [id, s.stability])),
        rivals: rivalsBase.filter((r) => r.authUid !== authUid),
        petitionReady,
        grievanceOpenAgainst: openGrievance(state, now)?.targetAuthUid ?? null,
        writ: pendingWrit(state, now)?.kind ?? null,
        courtOfferPending: state.courtOffer.status === "PENDING",
        favorRevoked: state.favor?.revoked === true
      });
      for (const action of actions) {
        const result = await perform(ctx, authUid, action);
        if (!result.ok) ctx.countAll(["duke_ai_action_rejected"]);
      }
    } catch (error) {
      ctx.deps.onError?.(error);
    }
  }
};

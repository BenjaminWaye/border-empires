import { runAiDukes } from "../galaxy-duke-ai/galaxy-duke-ai-runner.js";
import { checkConvergence } from "./galaxy-duke-court.js";
import { runCourtPass } from "./galaxy-duke-court-pass.js";
import { answerWritAction, declareGrievanceAction, lendFleetAction } from "./galaxy-duke-politics-actions.js";
import { runDukeTick } from "./galaxy-duke-tick.js";
import {
  answerCourtOfferAction,
  buildAction,
  cancelBuildAction,
  moveAgainstCourtAction,
  orderAction,
  type DukeActionResult,
  type OrderSpec
} from "./galaxy-duke-actions.js";
import { createDukeContext, type GalaxyDukeDeps } from "./galaxy-duke-context.js";
import { buildCourtPublicStatus, buildDukeStatus, type CourtPublicView, type DukeStatusView } from "./galaxy-duke-view.js";
import type { BuildSpec } from "../galaxy-duke-engine/galaxy-duke-production.js";

export type GalaxyDukeService = {
  status: (authUid: string) => Promise<DukeStatusView | undefined>;
  court: () => Promise<CourtPublicView>;
  build: (authUid: string, seasonId: string, spec: BuildSpec) => Promise<DukeActionResult>;
  cancelBuild: (authUid: string, seasonId: string) => Promise<DukeActionResult>;
  order: (authUid: string, fromSeasonId: string, spec: OrderSpec) => Promise<DukeActionResult>;
  answerCourtOffer: (authUid: string, accept: boolean) => Promise<DukeActionResult>;
  moveAgainstCourt: (authUid: string, influence: number) => Promise<DukeActionResult>;
  declareGrievance: (authUid: string, targetSeasonId: string) => Promise<DukeActionResult>;
  answerWrit: (authUid: string, accept: boolean) => Promise<DukeActionResult>;
  lendFleet: (authUid: string, fromSeasonId: string) => Promise<DukeActionResult>;
  tick: () => Promise<void>;
};

export const createGalaxyDukeService = (deps: GalaxyDukeDeps): GalaxyDukeService => {
  const ctx = createDukeContext(deps);
  return {
    status: (authUid) => buildDukeStatus(ctx, authUid),
    court: () => buildCourtPublicStatus(ctx),
    build: (authUid, seasonId, spec) => buildAction(ctx, authUid, seasonId, spec),
    cancelBuild: (authUid, seasonId) => cancelBuildAction(ctx, authUid, seasonId),
    order: (authUid, fromSeasonId, spec) => orderAction(ctx, authUid, fromSeasonId, spec),
    answerCourtOffer: (authUid, accept) => answerCourtOfferAction(ctx, authUid, accept),
    moveAgainstCourt: (authUid, influence) => moveAgainstCourtAction(ctx, authUid, influence),
    declareGrievance: (authUid, targetSeasonId) => declareGrievanceAction(ctx, authUid, targetSeasonId),
    answerWrit: (authUid, accept) => answerWritAction(ctx, authUid, accept),
    lendFleet: (authUid, fromSeasonId) => lendFleetAction(ctx, authUid, fromSeasonId),
    tick: async () => {
      await runDukeTick(ctx);
      // Neither pass may stop the era from ending (§27): a fault in one is
      // reported and the tick moves on to Convergence.
      for (const pass of [runAiDukes, runCourtPass]) {
        try {
          await pass(ctx);
        } catch (error) {
          deps.onError?.(error);
        }
      }
      await checkConvergence(ctx);
    }
  };
};

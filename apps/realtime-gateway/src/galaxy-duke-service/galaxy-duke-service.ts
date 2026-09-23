import { runDukeTick } from "./galaxy-duke-tick.js";
import {
  answerCourtOfferAction,
  cancelBuildAction,
  investAction,
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
  invest: (authUid: string, spec: BuildSpec) => Promise<DukeActionResult>;
  cancelBuild: (authUid: string) => Promise<DukeActionResult>;
  order: (authUid: string, spec: OrderSpec) => Promise<DukeActionResult>;
  answerCourtOffer: (authUid: string, accept: boolean) => Promise<DukeActionResult>;
  moveAgainstCourt: (authUid: string, influence: number) => Promise<DukeActionResult>;
  tick: () => Promise<void>;
};

export const createGalaxyDukeService = (deps: GalaxyDukeDeps): GalaxyDukeService => {
  const ctx = createDukeContext(deps);
  return {
    status: (authUid) => buildDukeStatus(ctx, authUid),
    court: () => buildCourtPublicStatus(ctx),
    invest: (authUid, spec) => investAction(ctx, authUid, spec),
    cancelBuild: (authUid) => cancelBuildAction(ctx, authUid),
    order: (authUid, spec) => orderAction(ctx, authUid, spec),
    answerCourtOffer: (authUid, accept) => answerCourtOfferAction(ctx, authUid, accept),
    moveAgainstCourt: (authUid, influence) => moveAgainstCourtAction(ctx, authUid, influence),
    tick: () => runDukeTick(ctx)
  };
};

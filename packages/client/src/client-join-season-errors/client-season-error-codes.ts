import type { ClientState } from "../client-state/client-state.js";
import { applyNextContestErrorCode } from "../client-next-contest/client-next-contest.js";
import { applyJoinSeasonErrorCode } from "./client-join-season-errors.js";

// Season-flow ERROR codes the network handler routes before its generic
// action-failure path: joining the current season, and committing to or
// force-starting the next Sector Contest. Neither swallows the ERROR, so the
// generic handler still adds the gateway's message to the event feed.
export const applySeasonErrorCodes = (
  state: Pick<ClientState, "joinSeasonPending" | "joinSeasonOverlayOpen" | "seasonEndStarting" | "seasonStartError" | "seasonWinner">,
  code: string,
  message: string,
  renderHud: () => void
): void => {
  applyJoinSeasonErrorCode(state, code, renderHud);
  if (applyNextContestErrorCode(state, code, message)) renderHud();
};

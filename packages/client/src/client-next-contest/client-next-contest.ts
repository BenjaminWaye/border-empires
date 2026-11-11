// The next Sector Contest, offered on the season-end screen. Once a contest
// ends, Houses commit to the next one (START_NEW_SEASON) and it starts when
// enough have committed or an admin force-starts it; see the gateway's
// next-contest.ts. The gateway keeps the old start vote's message and INIT
// field names, so this reads SEASON_START_VOTE_UPDATE and
// seasonStartVoteCount / seasonStartVoted / seasonStartVoteThreshold.
import type { ClientState } from "../client-state/client-state.js";

export const NEXT_CONTEST_DEFAULT_THRESHOLD = 10;

type NextContestState = Pick<ClientState, "me" | "seasonStartVoteCount" | "seasonStartVoted" | "seasonStartVoteThreshold">;
type NextContestLabelState = Pick<
  ClientState,
  "authIsGuest" | "seasonEndStarting" | "seasonStartVoteCount" | "seasonStartVoted" | "seasonStartVoteThreshold"
>;

const positiveCount = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;

/** SEASON_START_VOTE_UPDATE broadcast: a House committed. */
export const applyNextContestUpdate = (state: NextContestState, msg: Record<string, unknown>): void => {
  const count = positiveCount(msg.voteCount);
  const threshold = positiveCount(msg.threshold);
  if (count !== undefined) state.seasonStartVoteCount = count;
  if (threshold) state.seasonStartVoteThreshold = threshold;
  if (Array.isArray(msg.votedBy)) state.seasonStartVoted = msg.votedBy.includes(state.me);
};

/** INIT carries the same numbers, so a reload shows the real count. */
export const applyInitNextContest = (state: NextContestState, msg: Record<string, unknown>): void => {
  state.seasonStartVoteCount = positiveCount(msg.seasonStartVoteCount) ?? 0;
  state.seasonStartVoted = msg.seasonStartVoted === true;
  state.seasonStartVoteThreshold = positiveCount(msg.seasonStartVoteThreshold) || NEXT_CONTEST_DEFAULT_THRESHOLD;
};

const houses = (count: number): string => `${count} ${count === 1 ? "House" : "Houses"}`;

export const nextContestButtonLabel = (state: NextContestLabelState): string => {
  if (state.seasonEndStarting) return "Winding the Spring…";
  if (state.authIsGuest) return "Save your empire to join the next Sector Contest";
  const tally = `${state.seasonStartVoteCount}/${state.seasonStartVoteThreshold}`;
  if (state.seasonStartVoted) return `You're in · ${tally} Houses committed`;
  return `Join the next Sector Contest (${tally})`;
};

export const nextContestFineprint = (threshold: number): string =>
  `The next Sector Contest starts once ${houses(threshold)} have committed, and every committed House starts together. Until then you can keep looking around this world.`;

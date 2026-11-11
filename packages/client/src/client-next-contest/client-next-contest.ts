// The next Sector Contest, offered on the season-end screen. Once a contest
// ends, Houses commit to the next one (START_NEW_SEASON) and it starts when
// enough have committed or an admin force-starts it; see the gateway's
// next-contest.ts. The gateway keeps the old start vote's message and INIT
// field names, so this reads SEASON_START_VOTE_UPDATE and
// seasonStartVoteCount / seasonStartVoted / seasonStartVoteThreshold.
import type { ClientState } from "../client-state/client-state.js";

export const NEXT_CONTEST_DEFAULT_THRESHOLD = 10;

type NextContestState = Pick<
  ClientState,
  "me" | "seasonStartVoteCount" | "seasonStartVoted" | "seasonStartVoteThreshold" | "seasonEndStarting" | "seasonStartError"
>;
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
  // `starting` is announced while the next world is built (threshold reached
  // or admin force-start). Older gateways omit it; keep the local state then.
  if (typeof msg.starting === "boolean") state.seasonEndStarting = msg.starting;
  if (state.seasonEndStarting) state.seasonStartError = undefined;
};

/** INIT carries the same numbers, so a reload shows the real count. */
export const applyInitNextContest = (state: NextContestState, msg: Record<string, unknown>): void => {
  state.seasonStartVoteCount = positiveCount(msg.seasonStartVoteCount) ?? 0;
  state.seasonStartVoted = msg.seasonStartVoted === true;
  state.seasonStartVoteThreshold = positiveCount(msg.seasonStartVoteThreshold) || NEXT_CONTEST_DEFAULT_THRESHOLD;
  state.seasonEndStarting = msg.seasonStartStarting === true;
  state.seasonStartError = undefined;
};

// Gateway rejections of START_NEW_SEASON (commit or admin force-start). They
// used to reach only the event feed, which the season-end overlay covers, so
// a refused press looked like nothing happened. Shown on the overlay instead.
const NEXT_CONTEST_ERROR_CODES = new Set(["FORCE_START_FORBIDDEN", "SEASON_NOT_READY", "SEASON_NOT_ENDED", "ACCOUNT_REQUIRED"]);

/** Returns true when the ERROR belonged to the next-contest button. */
export const applyNextContestErrorCode = (
  state: Pick<ClientState, "seasonEndStarting" | "seasonStartError" | "seasonWinner">,
  code: string,
  message: string
): boolean => {
  if (!state.seasonWinner || !NEXT_CONTEST_ERROR_CODES.has(code)) return false;
  state.seasonEndStarting = false;
  state.seasonStartError = message || "The next Sector Contest could not start.";
  return true;
};

const houses = (count: number): string => `${count} ${count === 1 ? "House" : "Houses"}`;

export const nextContestButtonLabel = (state: NextContestLabelState): string => {
  if (state.seasonEndStarting) return "Starting the next Sector Contest…";
  if (state.authIsGuest) return "Save your empire to join the next Sector Contest";
  const tally = `${state.seasonStartVoteCount}/${state.seasonStartVoteThreshold}`;
  if (state.seasonStartVoted) return `You're in · ${tally} Houses committed`;
  return `Join the next Sector Contest (${tally})`;
};

export const nextContestFineprint = (threshold: number, starting = false): string =>
  starting
    ? "The next world is being built. This takes a minute or two: you'll be disconnected briefly, then brought into the new Sector Contest automatically."
    : `The next Sector Contest starts once ${houses(threshold)} have committed, and every committed House starts together. Until then you can keep looking around this world.`;

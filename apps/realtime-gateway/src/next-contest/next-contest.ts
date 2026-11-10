// The next Sector Contest, opened as soon as the current one ends.
//
// The simulation holds one world, so the next world is not generated until
// it is about to be played: while the ended world stays up (players keep
// looking around it), Houses commit to the next Sector Contest. Commitments
// are stored as Sector waitlist rows under their own key (nextContestKey), so
// they persist across gateway restarts. Only a press after the season has
// ended counts: rows from the "Sector full" waitlist stay a demand signal and
// never start a world on their own.
//
// The world starts once NEXT_CONTEST_MIN_COMMITTED Houses have committed, or
// when an admin force-starts it. Starting rolls the simulation over and then
// joins every committed account, online or not, before announcing the new
// season, so they all share the same start. Guests can't commit (no account to keep the slot), but a guest who
// is online at the start is sent in by the client's guest auto-join.
import type { SectorWaitlistStore } from "../sector-waitlist-store/sector-waitlist-store.js";

export const NEXT_CONTEST_MIN_COMMITTED = 10;

// Keeps the message and INIT field names of the old start vote, so a client
// bundle that predates this change still shows a live count.
export type NextContestUpdate = { type: "SEASON_START_VOTE_UPDATE"; voteCount: number; threshold: number; votedBy: string[] };
export type NextContestInitFields = { seasonStartVoteCount: number; seasonStartVoted: boolean; seasonStartVoteThreshold: number };
export type NextContestCommitResult =
  | { ok: true; count: number; started: boolean }
  | { ok: false; code: "ACCOUNT_REQUIRED" | "SEASON_NOT_ENDED"; message: string };

type CurrentSeason = { seasonId: string; status: string };

export type NextContestDeps = {
  store: SectorWaitlistStore;
  getCurrentSeason: () => Promise<CurrentSeason>;
  // The simulation refuses unless the current season has ended, so neither
  // a commitment nor an admin force can ever reset a live season.
  startNextSeason: () => Promise<{ seasonId: string }>;
  joinSeason: (playerId: string) => Promise<{ spawned: boolean; full?: boolean }>;
  onSeasonStarted: (seasonId: string, force: boolean) => void;
  broadcast: (payload: NextContestUpdate) => void;
  recordGatewayEvent: (level: "info" | "warn", event: string, payload: Record<string, unknown>) => void;
  minCommitted?: number;
  now?: () => number;
};

export type NextContest = ReturnType<typeof createNextContest>;

/** Waitlist key holding commitments to the contest after `endedSeasonId`. */
export const nextContestKey = (endedSeasonId: string): string => `${endedSeasonId}:next-contest`;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const createNextContest = (deps: NextContestDeps) => {
  const threshold = deps.minCommitted ?? NEXT_CONTEST_MIN_COMMITTED;
  const now = deps.now ?? (() => Date.now());
  // Committed ids for the ended season, kept so INIT can read them without
  // a database round trip. Cleared whenever no ended season is current.
  let cache: { seasonId: string; committed: string[] } | undefined;
  // Set synchronously by start() before its first await, so two callers can
  // never both begin a rollover.
  let starting = false;

  const load = async (endedSeasonId: string): Promise<string[]> => {
    const committed = await deps.store.list(nextContestKey(endedSeasonId));
    cache = { seasonId: endedSeasonId, committed };
    return committed;
  };

  const publish = (committed: string[]): void =>
    deps.broadcast({ type: "SEASON_START_VOTE_UPDATE", voteCount: committed.length, threshold, votedBy: [...committed] });

  const joinCommitted = async (committed: string[], seasonId: string): Promise<number> => {
    let spawned = 0;
    for (const playerId of committed) {
      try {
        const result = await deps.joinSeason(playerId);
        if (result.spawned) spawned += 1;
        else deps.recordGatewayEvent("warn", "gateway_next_contest_join_not_spawned", { playerId, seasonId, full: result.full === true });
      } catch (error) {
        deps.recordGatewayEvent("warn", "gateway_next_contest_join_failed", { playerId, seasonId, error: errorText(error) });
      }
    }
    return spawned;
  };

  // Resolves undefined when a start is already running.
  const start = async (endedSeasonId: string, force: boolean): Promise<{ seasonId: string } | undefined> => {
    if (starting) return undefined;
    starting = true;
    try {
      const { seasonId } = await deps.startNextSeason();
      cache = undefined;
      // Read after the rollover, not before: the world build takes a while
      // and the old season still reports ended meanwhile, so Houses can
      // commit during it. Once startNextSeason resolves, commits are refused.
      const committed = await deps.store.list(nextContestKey(endedSeasonId));
      // Committed Houses are placed before the start is announced, so the
      // announcement's arrivals can't take their slots.
      const spawned = await joinCommitted(committed, seasonId);
      deps.onSeasonStarted(seasonId, force);
      deps.recordGatewayEvent("info", "gateway_next_contest_started", { endedSeasonId, seasonId, force, committed: committed.length, spawned });
      return { seasonId };
    } finally {
      starting = false;
    }
  };

  // Starts the next contest when the current season has ended and enough
  // Houses have committed. Resolves true when it started one.
  const maybeStart = async (): Promise<boolean> => {
    if (starting) return false;
    const season = await deps.getCurrentSeason();
    if (season.status !== "ended") {
      cache = undefined;
      return false;
    }
    const committed = await load(season.seasonId);
    if (committed.length < threshold) return false;
    return (await start(season.seasonId, false)) !== undefined;
  };

  return {
    threshold,
    maybeStart,

    async commit(playerId: string, isGuest: boolean): Promise<NextContestCommitResult> {
      if (isGuest) return { ok: false, code: "ACCOUNT_REQUIRED", message: "Sign in with an account to join the next Sector Contest." };
      const season = await deps.getCurrentSeason();
      if (season.status !== "ended") return { ok: false, code: "SEASON_NOT_ENDED", message: "This Sector Contest is still running." };
      await deps.store.join({ seasonId: nextContestKey(season.seasonId), playerId, joinedAt: now() });
      const committed = await load(season.seasonId);
      publish(committed);
      if (committed.length < threshold) return { ok: true, count: committed.length, started: false };
      // A start already in progress re-reads the list after its rollover,
      // so this House is still joined.
      const started = (await start(season.seasonId, false)) !== undefined;
      return { ok: true, count: committed.length, started };
    },

    // Admin force-start: skips the commitment threshold, still only once the
    // current season has ended. Resolves undefined when there is nothing to start.
    async forceStart(): Promise<{ seasonId: string } | undefined> {
      if (starting) return undefined;
      const season = await deps.getCurrentSeason();
      if (season.status !== "ended") return undefined;
      return start(season.seasonId, true);
    },

    initFields(playerId: string): NextContestInitFields {
      const committed = cache?.committed ?? [];
      return { seasonStartVoteCount: committed.length, seasonStartVoted: committed.includes(playerId), seasonStartVoteThreshold: threshold };
    },

    // A season started some other way (admin HTTP route).
    reset(): void {
      cache = undefined;
    }
  };
};

// Checks once at boot and then every 15s, so commitments made before a
// restart still start it and a reload soon after the crown shows the count.
export const startNextContestTimer = (
  nextContest: Pick<NextContest, "maybeStart">,
  options: { intervalMs?: number; onError?: (error: unknown) => void } = {}
): { stop: () => void } => {
  const tick = (): void => {
    nextContest.maybeStart().catch((error: unknown) => options.onError?.(error));
  };
  const timer = setInterval(tick, options.intervalMs ?? 15_000);
  if (typeof timer.unref === "function") timer.unref();
  tick();
  return { stop: () => clearInterval(timer) };
};

// The next Sector Contest, opened as soon as the current one ends.
//
// The simulation holds one world, so the next world is not generated until
// it is about to be played: while the ended world stays up (players keep
// looking around it), Houses commit to the next Sector Contest. Commitments
// are the Sector waitlist rows keyed by the ended season's id, so they
// persist across gateway restarts and include accounts that joined the
// waitlist while that Sector was still running but full.
//
// The world starts once NEXT_CONTEST_MIN_COMMITTED Houses have committed, or
// when an admin force-starts it. Starting rolls the simulation over and then
// joins every committed account, online or not, so they all share the same
// start. Guests can't commit (no account to keep the slot), but a guest who
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

export const createNextContest = (deps: NextContestDeps) => {
  const threshold = deps.minCommitted ?? NEXT_CONTEST_MIN_COMMITTED;
  const now = deps.now ?? (() => Date.now());
  // Committed ids for the ended season, kept so INIT can read them without
  // a database round trip. Cleared whenever no ended season is current.
  let cache: { seasonId: string; committed: string[] } | undefined;
  let starting = false;

  const load = async (seasonId: string): Promise<string[]> => {
    const committed = await deps.store.list(seasonId);
    cache = { seasonId, committed };
    return committed;
  };

  const publish = (committed: string[]): void =>
    deps.broadcast({ type: "SEASON_START_VOTE_UPDATE", voteCount: committed.length, threshold, votedBy: [...committed] });

  const start = async (endedSeasonId: string, force: boolean): Promise<{ seasonId: string }> => {
    starting = true;
    try {
      const committed = await deps.store.list(endedSeasonId);
      const { seasonId } = await deps.startNextSeason();
      cache = undefined;
      deps.onSeasonStarted(seasonId, force);
      let spawned = 0;
      for (const playerId of committed) {
        try {
          const result = await deps.joinSeason(playerId);
          if (result.spawned) spawned += 1;
          else deps.recordGatewayEvent("warn", "gateway_next_contest_join_not_spawned", { playerId, seasonId, full: result.full === true });
        } catch (error) {
          deps.recordGatewayEvent("warn", "gateway_next_contest_join_failed", {
            playerId,
            seasonId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
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
    await start(season.seasonId, false);
    return true;
  };

  return {
    threshold,
    maybeStart,

    async commit(playerId: string, isGuest: boolean): Promise<NextContestCommitResult> {
      if (isGuest) return { ok: false, code: "ACCOUNT_REQUIRED", message: "Sign in with an account to join the next Sector Contest." };
      const season = await deps.getCurrentSeason();
      if (season.status !== "ended") return { ok: false, code: "SEASON_NOT_ENDED", message: "This Sector Contest is still running." };
      await deps.store.join({ seasonId: season.seasonId, playerId, joinedAt: now() });
      const committed = await load(season.seasonId);
      publish(committed);
      if (committed.length < threshold || starting) return { ok: true, count: committed.length, started: false };
      await start(season.seasonId, false);
      return { ok: true, count: committed.length, started: true };
    },

    // An account joined the waitlist over HTTP: share the new count and
    // start if that was the commitment the next contest was waiting for.
    async noteCommitted(seasonId: string): Promise<void> {
      publish(await load(seasonId));
      await maybeStart();
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

// Checks once at boot and then every minute, so commitments made before a
// restart, or waitlist rows from while the Sector was full, still start it.
export const startNextContestTimer = (
  nextContest: Pick<NextContest, "maybeStart">,
  options: { intervalMs?: number; onError?: (error: unknown) => void } = {}
): { stop: () => void } => {
  const tick = (): void => {
    nextContest.maybeStart().catch((error: unknown) => options.onError?.(error));
  };
  const timer = setInterval(tick, options.intervalMs ?? 60_000);
  if (typeof timer.unref === "function") timer.unref();
  tick();
  return { stop: () => clearInterval(timer) };
};
